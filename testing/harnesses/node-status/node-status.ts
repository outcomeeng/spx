import { execa } from "execa";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { type RecordedTestRun, runNodeCommand } from "@/commands/test";
import { DEFAULT_METHODOLOGY_SOURCE, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Config } from "@/config/types";
import { GIT_NULL_DELIMITED_FLAG, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND, GIT_STATUS_PORCELAIN_ARGS, type GitDependencies } from "@/lib/git/root";
import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  createPinChangeReader,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FILENAME,
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeOutcomeResolver,
  type NodeStatusClaimEntry,
  type NodeStatusClaimVerification,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
  type PinChangeReader,
  readNodeStatus,
  serializeNodeStatus,
  serializeNodeStatusClaim,
} from "@/lib/node-status";
import {
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import type {
  ClassificationFixtureFacts,
  ClassificationTreeFixture,
  PinnedNodeFixture,
  StatusWriterTreeFixture,
  StatusWriterTreeNode,
  VariantParentFixture,
} from "@testing/generators/node-status/node-status";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
} from "@testing/harnesses/git-test-constants";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

const ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SPEC_FILE_SUFFIX = SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX;
const EXCLUDE_ENTRY_SEPARATOR = NODE_STATUS_EXCLUDE_LINE_GRAMMAR.ENTRY_SEPARATOR;
const NODE_STATUS_FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "node-status",
);
/** The inert whole-payload fixtures a classification tree materializes, by absolute path. */
export const CLASSIFICATION_FIXTURE_PATHS = {
  spec: join(NODE_STATUS_FIXTURE_DIRECTORY, "classification-spec.md.fixture"),
  test: join(NODE_STATUS_FIXTURE_DIRECTORY, "classification-test.ts.fixture"),
} as const;
const NODE_STATUS_FIXTURE_COMMIT_MESSAGE = "node-status fixture";
/**
 * Porcelain v1 `-z` output: each record is a two-character status code, one space,
 * and the path, terminated by NUL; a rename or copy record is followed by one more
 * NUL-terminated record carrying the source path with no status code.
 */
const GIT_PORCELAIN_STATUS_PREFIX_LENGTH = 3;
const GIT_PORCELAIN_SOURCE_PATH_CODES: ReadonlySet<string> = new Set(["R", "C"]);

export type ClassificationTreeNodeExpectation = {
  readonly nodeId: string;
  readonly slug: string;
  readonly facts: ClassificationFixtureFacts;
  readonly evidencePaths: readonly string[];
  readonly statusPath: string;
};

export type ClassificationTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly expectations: readonly ClassificationTreeNodeExpectation[];
  readonly fixturePayloads: {
    readonly spec: string;
    readonly test: string;
  };
  /** The production resolver over whatever testing evidence is recorded so far; it records none itself. */
  recordedOutcomeResolver(): NodeOutcomeResolver;
  recordOutcomeEvidence(): Promise<{
    readonly resolveOutcome: NodeOutcomeResolver;
    readonly runs: readonly {
      readonly nodeId: string;
      readonly evidencePaths: readonly string[];
      readonly result: RecordedTestRun;
      readonly runnerCalls: readonly {
        readonly command: string;
        readonly args: readonly string[];
      }[];
    }[];
  }>;
};

// Materialize a generated classification tree into a temp product directory:
// each node becomes a directory with a spec file, optional co-located tests, and
// optional spx/EXCLUDE membership, exactly as the classification facts dictate.
// The temp directory is provisioned from the minimal spec-tree config, so the
// harness never reads the real repository's configuration.
export async function withClassificationTree(
  fixture: ClassificationTreeFixture,
  callback: (tree: ClassificationTreeEnv) => Promise<void>,
): Promise<void> {
  await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFixture(CLASSIFICATION_FIXTURE_PATHS.spec),
      readFixture(CLASSIFICATION_FIXTURE_PATHS.test),
    ]);
    const materialized = await materializeNodes(
      env,
      fixture.nodes.map((node) => ({
        dirName: node.dirName,
        slug: node.slug,
        isExcluded: node.facts.isExcluded,
        evidenceReferences: node.evidenceReference === undefined ? [] : [node.evidenceReference],
      })),
      { spec: specContent, test: testContent },
    );
    const expectations: ClassificationTreeNodeExpectation[] = fixture.nodes.map((node, index) => ({
      nodeId: node.dirName,
      slug: node.slug,
      facts: node.facts,
      evidencePaths: materialized[index]?.evidencePaths ?? [],
      statusPath: nodeTreePath(node.dirName, NODE_STATUS_FILENAME),
    }));

    await callback({
      env,
      expectations,
      fixturePayloads: { spec: specContent, test: testContent },
      recordedOutcomeResolver: () =>
        createNodeOutcomeResolver({ productDir: env.productDir, registry: testingRegistry }),
      recordOutcomeEvidence: async () => {
        const runs: Array<{
          readonly nodeId: string;
          readonly evidencePaths: readonly string[];
          readonly result: RecordedTestRun;
          readonly runnerCalls: readonly {
            readonly command: string;
            readonly args: readonly string[];
          }[];
        }> = [];
        for (const expectation of expectations) {
          if (!expectation.facts.hasVerificationReferences || expectation.facts.isExcluded) continue;
          const runner = createRecordingCommandRunner({
            present: true,
            exitCode: expectation.facts.runnerExitCode,
          });
          const result = await runNodeCommand(
            { productDir: env.productDir, nodePath: nodeTreePath(expectation.nodeId) },
            {
              registry: testingRegistry,
              runnerDepsFor: () => runner,
            },
          );
          runs.push({
            nodeId: expectation.nodeId,
            evidencePaths: expectation.evidencePaths,
            result,
            runnerCalls: runner.calls,
          });
        }
        return {
          resolveOutcome: createNodeOutcomeResolver({ productDir: env.productDir, registry: testingRegistry }),
          runs,
        };
      },
    });
  });
}

type MaterializedNodeSpec = {
  readonly dirName: string;
  readonly slug: string;
  readonly isExcluded: boolean;
  readonly evidenceReferences: readonly string[];
};

/**
 * Write each node's spec file and linked evidence files from the inert payloads, and
 * list every excluded node in `spx/EXCLUDE`; returns each node's product-relative
 * evidence paths in input order.
 */
async function materializeNodes(
  env: SpecTreeEnv,
  nodes: readonly MaterializedNodeSpec[],
  payloads: { readonly spec: string; readonly test: string },
): Promise<readonly { readonly evidencePaths: readonly string[] }[]> {
  const materialized: { readonly evidencePaths: readonly string[] }[] = [];
  for (const node of nodes) {
    await env.writeNode(nodeTreePath(node.dirName, `${node.slug}${SPEC_FILE_SUFFIX}`), payloads.spec);
    const evidencePaths = node.evidenceReferences.map((reference) => nodeTreePath(node.dirName, reference));
    for (const evidencePath of evidencePaths) {
      await env.writeNode(evidencePath, payloads.test);
    }
    materialized.push({ evidencePaths });
  }
  const excludedDirs = nodes.filter((node) => node.isExcluded).map((node) => node.dirName);
  if (excludedDirs.length > 0) {
    await env.writeRaw(
      nodeTreePath(NODE_STATUS_EXCLUDE_FILENAME),
      `${excludedDirs.join(EXCLUDE_ENTRY_SEPARATOR)}${EXCLUDE_ENTRY_SEPARATOR}`,
    );
  }
  return materialized;
}

export type StatusWriterTreeNodeExpectation = {
  readonly nodeId: string;
  /** Product-relative paths of the node's linked evidence, as the fixture materializes them. */
  readonly evidencePaths: readonly string[];
  readonly statusPath: string;
};

export type StatusWriterTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly expectations: readonly StatusWriterTreeNodeExpectation[];
  /**
   * A controlled node-outcome resolver answering each consulted evidence path with
   * the outcome the fixture generated for it and omitting the paths the fixture marks
   * covered-but-stale (combinatorial-cost exception: the production resolver needs a
   * recorded run per node and a staleness edit per stale reference to reach the same
   * answers).
   */
  readonly resolveOutcome: NodeOutcomeResolver;
};

/**
 * Materialize a generated status-writer tree into a temporary product directory —
 * spec files, linked evidence, `spx/EXCLUDE` membership, and each node's committed
 * status claims. The directory is left outside any git repository, so a status update
 * over it applies no tracked-path scoping and every generated case varies only the
 * writer's own inputs.
 */
export async function withStatusWriterTree(
  fixture: StatusWriterTreeFixture,
  callback: (tree: StatusWriterTreeEnv) => Promise<void>,
  config: Config = MINIMAL_SPEC_TREE_CONFIG,
): Promise<void> {
  await withTestEnv(config, async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFixture(CLASSIFICATION_FIXTURE_PATHS.spec),
      readFixture(CLASSIFICATION_FIXTURE_PATHS.test),
    ]);
    const materialized = await materializeNodes(
      env,
      fixture.nodes.map((node) => ({
        dirName: node.dirName,
        slug: node.slug,
        isExcluded: node.isExcluded,
        evidenceReferences: node.references.map((reference) => reference.reference),
      })),
      { spec: specContent, test: testContent },
    );
    const resolverAnswers = new Map<string, NodeStatusEvidenceOutcome>();
    const expectations: StatusWriterTreeNodeExpectation[] = [];

    for (const [index, node] of fixture.nodes.entries()) {
      for (const reference of node.references) {
        if (reference.resolverOutcome !== undefined) {
          resolverAnswers.set(nodeTreePath(node.dirName, reference.reference), reference.resolverOutcome);
        }
      }
      const statusPath = nodeTreePath(node.dirName, NODE_STATUS_FILENAME);
      await writeCommittedClaims(env, statusPath, committedClaims(node));
      expectations.push({ nodeId: node.dirName, evidencePaths: materialized[index]?.evidencePaths ?? [], statusPath });
    }

    await callback({
      env,
      expectations,
      resolveOutcome: (_nodeId, evidencePaths) =>
        Promise.resolve(
          Object.fromEntries(
            evidencePaths.flatMap((evidencePath) => {
              const outcome = resolverAnswers.get(evidencePath);
              return outcome === undefined ? [] : [[evidencePath, outcome] as const];
            }),
          ),
        ),
    });
  });
}

/** The committed test claims of a status-writer-tree node, keyed by product-relative evidence path. */
function committedClaims(node: StatusWriterTreeNode): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  const claims: Record<string, NodeStatusEvidenceOutcome> = {};
  for (const reference of node.references) {
    if (reference.committedOutcome !== undefined) {
      claims[nodeTreePath(node.dirName, reference.reference)] = reference.committedOutcome;
    }
  }
  if (node.unlinkedClaim !== undefined) {
    claims[nodeTreePath(node.dirName, node.unlinkedClaim.reference)] = node.unlinkedClaim.outcome;
  }
  return claims;
}

/** Write `claims` as the node's committed status file, or nothing when the node carries no claim. */
async function writeCommittedClaims(
  env: SpecTreeEnv,
  statusPath: string,
  claims: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): Promise<void> {
  if (Object.keys(claims).length === 0) return;
  await env.writeRaw(
    statusPath,
    serializeNodeStatus(
      createNodeStatusFile({
        [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(claims),
      }),
    ),
  );
}

/** A spec-tree path under the root directory, composed with the spec-tree path grammar. */
function nodeTreePath(...segments: readonly string[]): string {
  return [ROOT, ...segments].join(PATH_SEPARATOR);
}

function readFixture(fixturePath: string): Promise<string> {
  return readFile(fixturePath, "utf8");
}

/** One call the status update made to its injected node-outcome resolver. */
export type NodeOutcomeConsultation = {
  readonly nodeId: string;
  readonly evidencePaths: readonly string[];
};

/**
 * Wrap a node-outcome resolver in a recording collaborator: every consultation is
 * forwarded unchanged to `resolver` and appended to `consultations`, so a test can
 * observe which nodes and evidence paths the status update asked about.
 */
export function createConsultationRecordingResolver(resolver: NodeOutcomeResolver): {
  readonly resolveOutcome: NodeOutcomeResolver;
  readonly consultations: readonly NodeOutcomeConsultation[];
} {
  const consultations: NodeOutcomeConsultation[] = [];
  return {
    consultations,
    resolveOutcome: (nodeId, evidencePaths) => {
      consultations.push({ nodeId, evidencePaths: [...evidencePaths] });
      return resolver(nodeId, evidencePaths);
    },
  };
}

/**
 * A git runner conforming to the production `GitDependencies` interface whose every
 * run uses the isolated git test environment: inherited Git context stripped, the
 * developer's global git config neutralized, and the GitHub Actions reporter trigger
 * removed, with no ambient environment extended. A run that exits non-zero, or that
 * reports no exit code, rejects.
 */
export const isolatedFixtureGitDependencies: GitDependencies = {
  execa: async (command, args, options) => {
    const result = await execa(command, args, {
      ...options,
      env: buildGitTestEnvironment(),
      extendEnv: false,
    });
    if (result.exitCode === undefined) {
      throw new Error(`${command} ${args.join(" ")} reported no exit code`);
    }
    return {
      exitCode: result.exitCode,
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    };
  },
};

/**
 * Run git in `productDir` through the isolated fixture git runner, taking the
 * executable from its production owner; a non-zero exit rejects.
 */
export async function runFixtureGit(
  productDir: string,
  args: readonly string[],
  options: { readonly stripFinalNewline?: boolean } = {},
): Promise<string> {
  const result = await isolatedFixtureGitDependencies.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...args], {
    cwd: productDir,
    ...options,
  });
  return result.stdout;
}

/** Initialize a git repository in `productDir` and stage the spec tree, leaving it tracked but uncommitted. */
export async function trackSpecTree(productDir: string): Promise<void> {
  await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ROOT]);
}

/** Stage and commit the spec tree in an initialized repository under a fixed test identity. */
export async function commitSpecTree(productDir: string): Promise<void> {
  await commitPaths(productDir, [ROOT]);
}

/** Stage and commit `paths` in an initialized repository under a fixed test identity. */
export async function commitPaths(productDir: string, paths: readonly string[]): Promise<void> {
  await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ...paths]);
  await runFixtureGit(productDir, [
    GIT_TEST_FLAGS.CONFIG_OVERRIDE,
    `${GIT_TEST_CONFIG.USER_NAME_KEY}=${GIT_TEST_CONFIG.USER_NAME}`,
    GIT_TEST_FLAGS.CONFIG_OVERRIDE,
    `${GIT_TEST_CONFIG.EMAIL_KEY}=${GIT_TEST_CONFIG.EMAIL}`,
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_ROOT_COMMAND.QUIET,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    NODE_STATUS_FIXTURE_COMMIT_MESSAGE,
  ]);
}

/**
 * Every spec-tree path git reports as changed against the last commit — staged,
 * unstaged, or untracked, under any status code, and both paths of a rename or copy —
 * read untrimmed through the isolated fixture git runner and the production working-tree status command in
 * git's NUL-terminated form.
 */
export async function readSpecTreeWorkingChanges(productDir: string): Promise<readonly string[]> {
  const records = (
    await runFixtureGit(productDir, [...GIT_STATUS_PORCELAIN_ARGS, GIT_NULL_DELIMITED_FLAG], {
      stripFinalNewline: false,
    })
  ).split(GIT_NULL_RECORD_SEPARATOR).values();
  const changedPaths: string[] = [];
  for (const record of records) {
    if (record.length === 0) continue;
    changedPaths.push(record.slice(GIT_PORCELAIN_STATUS_PREFIX_LENGTH));
    const statusCode = record.slice(0, GIT_PORCELAIN_STATUS_PREFIX_LENGTH - 1);
    if (![...statusCode].some((code) => GIT_PORCELAIN_SOURCE_PATH_CODES.has(code))) continue;
    const sourcePath = records.next();
    if (sourcePath.done !== true) changedPaths.push(sourcePath.value);
  }
  const specTreePrefix = `${ROOT}${PATH_SEPARATOR}`;
  return changedPaths.filter((path) => path.startsWith(specTreePrefix));
}

/** Every `spx.status.json` under the spec tree of `productDir`, as product-relative paths. */
export async function listNodeStatusFiles(productDir: string): Promise<readonly string[]> {
  const entries = await readdir(join(productDir, ROOT), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === NODE_STATUS_FILENAME)
    .map((entry) => relative(productDir, join(entry.parentPath, entry.name)));
}

/** The raw bytes of every `spx.status.json` under the spec tree of `productDir`, keyed by product-relative path. */
export async function readNodeStatusFileBytes(productDir: string): Promise<Readonly<Record<string, Buffer>>> {
  const paths = await listNodeStatusFiles(productDir);
  return Object.fromEntries(
    await Promise.all(paths.map(async (path) => [path, await readFile(join(productDir, path))] as const)),
  );
}

/** The version-1 claim co-located in `nodeDir`, or nothing when the node has no status file; a claim of another shape rejects. */
export function readVersion1NodeStatus(nodeDir: string): NodeStatusFile | undefined {
  const read = readNodeStatus(nodeDir);
  if (read === undefined) return undefined;
  if (read.shape !== NODE_STATUS_CLAIM_SHAPE.VERSION_1) {
    throw new Error(`Expected a ${NODE_STATUS_CLAIM_SHAPE.VERSION_1} claim in ${nodeDir}, read ${read.shape}`);
  }
  return read.claim;
}

/** A configuration declaring `version` as the product's methodology version, beside the minimal spec-tree kinds. */
export function methodologyDeclaringConfig(version: string): Config {
  return {
    ...MINIMAL_SPEC_TREE_CONFIG,
    [METHODOLOGY_SECTION]: { source: DEFAULT_METHODOLOGY_SOURCE, version },
  };
}

const LINKED_SPEC_FIXTURE_PATH = join(NODE_STATUS_FIXTURE_DIRECTORY, "linked-spec.md.fixture");
const SPEC_LINK_TARGET_PATTERN = /\]\((tests\/[^)\s]+)\)/g;
const SPEC_LINK_TARGET_GROUP = 1;
const SUBJECT_APPENDIX = "\n// edited\n";
const SPEC_APPENDIX = "\nAn added sentence.\n";
const REPOSITORY_ROOT_PATHS = ["."] as const;
const UNRELATED_FILE_PATH = "unrelated.txt";
const AUDIT_RULE_TAG_PATTERN = /\[audit:([a-z0-9-]+)\]/g;
const AUDIT_RULE_TAG_GROUP = 1;
const VARIANT_SUBJECT_DIRECTORY = "src";

/** A committed single-node repository whose results can be pinned to its spec, tests, and source subjects. */
export type PinnedNodeRepository = {
  readonly env: SpecTreeEnv;
  readonly nodeId: string;
  readonly nodePath: string;
  readonly specPath: string;
  /** Product-relative paths of the tests the spec links. */
  readonly testPaths: readonly string[];
  readonly subjectPaths: readonly string[];
  /** The commit every pin of this repository names. */
  readonly commit: string;
  readonly git: GitDependencies;
  /** The audit rule slugs the spec tags, read from the spec fixture. */
  readonly auditRuleSlugs: readonly string[];
  /** A pin-change reader that has compared no commit with the checkout yet. */
  readonly pinChanges: PinChangeReader;
  /** A passed entry pinned to the repository's commit over `read`. */
  passedEntry(read: readonly string[]): NodeStatusClaimEntry;
  /** Write `verification` as the node's 4.0 claim, recording `state`. */
  writeClaim(verification: NodeStatusClaimVerification, state?: SpecTreeNodeState): Promise<void>;
  /** Commit every change in the repository and return the new head. */
  commitAll(): Promise<string>;
  /** Commit a file no node reads and return the new head. */
  commitUnrelatedFile(): Promise<string>;
  editSubject(index: number): Promise<void>;
  /** Rewrite each spec link to its tree-absolute spelling, keeping every label and target. */
  rewriteSpecLinksTreeAbsolute(): Promise<void>;
  /** Add a sentence to the spec. */
  editSpecText(): Promise<void>;
};

/**
 * Materialize and commit a node with a spec linking two tests and tagging two audit rules, the tests, and the
 * source subjects of `fixture`, in a temporary product directory under the methodology `config` declares.
 */
export async function withPinnedNodeRepository(
  fixture: PinnedNodeFixture,
  config: Config,
  callback: (repository: PinnedNodeRepository) => Promise<void>,
): Promise<void> {
  await withTestEnv(config, async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFixture(LINKED_SPEC_FIXTURE_PATH),
      readFixture(CLASSIFICATION_FIXTURE_PATHS.test),
    ]);
    const nodePath = nodeTreePath(fixture.dirName);
    const specPath = `${nodePath}${PATH_SEPARATOR}${fixture.slug}${SPEC_FILE_SUFFIX}`;
    const linkedTests = [...specContent.matchAll(SPEC_LINK_TARGET_PATTERN)].flatMap((match) => {
      const target = match.at(SPEC_LINK_TARGET_GROUP);
      return target === undefined ? [] : [target];
    });
    const testPaths = linkedTests.map((target) => `${nodePath}${PATH_SEPARATOR}${target}`);
    await env.writeNode(specPath, specContent);
    for (const testPath of testPaths) await env.writeNode(testPath, testContent);
    for (const subjectPath of fixture.subjectPaths) await env.writeRaw(subjectPath, testContent);
    await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
    const commit = await runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);

    await callback({
      env,
      nodeId: fixture.dirName,
      nodePath,
      specPath,
      testPaths,
      subjectPaths: fixture.subjectPaths,
      commit,
      git: isolatedFixtureGitDependencies,
      auditRuleSlugs: [...specContent.matchAll(AUDIT_RULE_TAG_PATTERN)].flatMap((match) => {
        const slug = match.at(AUDIT_RULE_TAG_GROUP);
        return slug === undefined ? [] : [slug];
      }),
      get pinChanges() {
        return createPinChangeReader({ productDir: env.productDir, git: isolatedFixtureGitDependencies });
      },
      passedEntry: (read) => ({
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
        [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
        [NODE_STATUS_CLAIM_FIELD.READ]: read,
      }),
      writeClaim: (verification, state) => writeClaim(env, nodePath, verification, state),
      commitAll: async () => {
        await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
        return runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
      },
      commitUnrelatedFile: async () => {
        await env.writeRaw(UNRELATED_FILE_PATH, testContent);
        await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
        return runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
      },
      editSubject: async (index) => {
        const path = fixture.subjectPaths.at(index);
        if (path === undefined) throw new Error(`No subject at index ${index}`);
        await env.writeRaw(path, `${testContent}${SUBJECT_APPENDIX}`);
      },
      rewriteSpecLinksTreeAbsolute: () =>
        env.writeNode(specPath, specContent.replaceAll("](tests/", `](${nodePath}${PATH_SEPARATOR}tests/`)),
      editSpecText: () => env.writeNode(specPath, `${specContent}${SPEC_APPENDIX}`),
    });
  });
}

async function writeClaim(
  env: SpecTreeEnv,
  nodePath: string,
  verification: NodeStatusClaimVerification,
  state: SpecTreeNodeState = SPEC_TREE_NODE_STATE.SPECIFIED,
): Promise<void> {
  await env.writeRaw(
    `${nodePath}${PATH_SEPARATOR}${NODE_STATUS_FILENAME}`,
    serializeNodeStatusClaim({
      [NODE_STATUS_CLAIM_FIELD.STATE]: state,
      [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: NODE_STATUS_MALLEABILITY.IMPLEMENTATION,
      [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: verification,
    }),
  );
}

/** A committed parent with variants, each carrying a 4.0 claim whose one test result passes or fails. */
export type VariantTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly parentId: string;
  readonly variants: readonly { readonly nodeId: string; readonly passes: boolean }[];
  readonly git: GitDependencies;
};

export async function withVariantTree(
  fixture: VariantParentFixture,
  config: Config,
  callback: (tree: VariantTreeEnv) => Promise<void>,
): Promise<void> {
  await withTestEnv(config, async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFixture(CLASSIFICATION_FIXTURE_PATHS.spec),
      readFixture(CLASSIFICATION_FIXTURE_PATHS.test),
    ]);
    const parentPath = nodeTreePath(fixture.parentDirName);
    await env.writeNode(`${parentPath}${PATH_SEPARATOR}${fixture.parentSlug}${SPEC_FILE_SUFFIX}`, specContent);
    const variants = fixture.variants.map((variant) => {
      const nodePath = `${parentPath}${PATH_SEPARATOR}${variant.dirName}`;
      const testKey = [
        SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
        [variant.slug, "scenario", "l1", ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT].join(
          SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR,
        ),
      ].join(PATH_SEPARATOR);
      return {
        ...variant,
        nodePath,
        testKey,
        specPath: `${nodePath}${PATH_SEPARATOR}${variant.slug}${SPEC_FILE_SUFFIX}`,
        testPath: `${nodePath}${PATH_SEPARATOR}${testKey}`,
        subjectPath: `${VARIANT_SUBJECT_DIRECTORY}${PATH_SEPARATOR}${variant.slug}.ts`,
      };
    });
    for (const variant of variants) {
      await env.writeNode(variant.specPath, specContent);
      await env.writeNode(variant.testPath, testContent);
      await env.writeRaw(variant.subjectPath, testContent);
    }
    await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
    const commit = await runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    for (const variant of variants) {
      await writeClaim(env, variant.nodePath, {
        [NODE_STATUS_CLAIM_SECTION.TEST]: {
          [variant.testKey]: {
            [NODE_STATUS_CLAIM_FIELD.VERDICT]: variant.passes
              ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
              : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
            [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
            [NODE_STATUS_CLAIM_FIELD.READ]: [variant.specPath, variant.testPath, variant.subjectPath],
          },
        },
      });
    }
    await writeClaim(env, parentPath, {});
    await callback({
      env,
      parentId: fixture.parentDirName,
      variants: variants.map((variant) => ({
        nodeId: `${fixture.parentDirName}${PATH_SEPARATOR}${variant.dirName}`,
        passes: variant.passes,
      })),
      git: isolatedFixtureGitDependencies,
    });
  });
}
