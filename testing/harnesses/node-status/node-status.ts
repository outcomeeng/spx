import { execa } from "execa";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, posix, relative } from "node:path";
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
  createNodeStatusProvider,
  createPinChangeReader,
  NODE_STATUS_ACTOR_KIND,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_DEFAULT_MALLEABILITY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FILENAME,
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeAttributedRequest,
  type NodeAttributedResultResolver,
  type NodeOutcomeResolver,
  type NodeReadPathResolver,
  type NodeStatusClaim,
  type NodeStatusClaimEntry,
  type NodeStatusClaimSection,
  type NodeStatusClaimVerification,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
  type NodeStatusMalleability,
  type PinChangeReader,
  readNodeStatus,
  serializeNodeStatus,
  serializeNodeStatusClaim,
  updateNodeStatus,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  KIND_REGISTRY,
  readSpecTree,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_LINK_TEXT,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  ANCESTOR_DECISION_PLACEMENT,
  type ClaimComparisonFixture,
  type ClassificationFixtureFacts,
  type ClassificationTreeFixture,
  createClaimedTestStatus,
  DECISION_PLACEMENT,
  type DecisionPlacement,
  NODE_STATUS_TEST_GENERATOR,
  type PinnedNodeFixture,
  type RecordedRun,
  type RecordedRunSets,
  type StatusWriterTreeFixture,
  type StatusWriterTreeNode,
  type VariantParentFixture,
} from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
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
const EVIDENCE_DIRECTORY = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
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
  /**
   * Track the spec tree in a fresh repository, record the outcome evidence, write the projection `--update`
   * produces from it, commit that projection, and return the resolver over the recorded evidence.
   */
  commitProjection(): Promise<NodeOutcomeResolver>;
  /** Replace the committed status file of `node` with a version-1 claim of every linked reference as `outcome`, and commit it. */
  commitContradiction(node: ClassificationTreeNodeExpectation, outcome: NodeStatusEvidenceOutcome): Promise<void>;
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

    const recordOutcomeEvidence: ClassificationTreeEnv["recordOutcomeEvidence"] = async () => {
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
    };

    await callback({
      env,
      expectations,
      fixturePayloads: { spec: specContent, test: testContent },
      recordedOutcomeResolver: () =>
        createNodeOutcomeResolver({ productDir: env.productDir, registry: testingRegistry }),
      recordOutcomeEvidence,
      commitProjection: async () => {
        await trackSpecTree(env.productDir);
        const { resolveOutcome } = await recordOutcomeEvidence();
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome });
        await commitSpecTree(env.productDir);
        return resolveOutcome;
      },
      commitContradiction: async (node, outcome) => {
        await env.writeRaw(node.statusPath, serializeNodeStatus(createClaimedTestStatus(node.evidencePaths, outcome)));
        await commitSpecTree(env.productDir);
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

/** Write a `.product` spec at the spec-tree root under `name`, from the inert spec payload. */
export async function writeProductSpec(env: SpecTreeEnv, name: string): Promise<void> {
  await env.writeNode(
    nodeTreePath(`${name}${SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX}`),
    await readFixture(CLASSIFICATION_FIXTURE_PATHS.spec),
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
 * Wrap an attributed-result resolver in a recording collaborator: every request is forwarded unchanged to
 * `resolver` and appended to `requests`, so a test can observe which audit rule slugs and evidence kinds the
 * status update asked for.
 */
export function createAttributedRequestRecorder(resolver: NodeAttributedResultResolver): {
  readonly resolveAttributedResults: NodeAttributedResultResolver;
  readonly requests: readonly NodeAttributedRequest[];
} {
  const requests: NodeAttributedRequest[] = [];
  return {
    requests,
    resolveAttributedResults: (nodeId, request) => {
      requests.push({ auditRuleSlugs: [...request.auditRuleSlugs], evidenceKinds: [...request.evidenceKinds] });
      return resolver(nodeId, request);
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

/** A configuration declaring a methodology version of the current claim shape, drawn from the node-status generator. */
export function currentMethodologyConfig(): Config {
  return methodologyDeclaringConfig(
    sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.methodologyVersion(NODE_STATUS_CLAIM_SHAPE.CURRENT)),
  );
}

/** The actor and run a recorded agent result carries, naming `actorId` as the agent and `run` as its run. */
export function nodeStatusAttribution(actorId: string, run: string) {
  return {
    [NODE_STATUS_CLAIM_FIELD.ACTOR]: {
      [NODE_STATUS_CLAIM_FIELD.ACTOR_KIND]: NODE_STATUS_ACTOR_KIND.AGENT,
      id: actorId,
    },
    [NODE_STATUS_CLAIM_FIELD.RUN]: run,
  };
}

/** The inert linked-spec payloads a pinned node repository materializes; each names what its spec declares and links. */
export const PINNED_SPEC_FIXTURE = {
  /** No malleability front matter, two linked tests, and two audit rules. */
  DEFAULT: join(NODE_STATUS_FIXTURE_DIRECTORY, "linked-spec.md.fixture"),
  /** The default spec's links, declaring the `spec` malleability. */
  SPEC_MALLEABLE: join(NODE_STATUS_FIXTURE_DIRECTORY, "linked-spec-spec-malleability.md.fixture"),
  /** The default spec's links, declaring the `verification` malleability. */
  VERIFICATION_MALLEABLE: join(NODE_STATUS_FIXTURE_DIRECTORY, "linked-spec-verification-malleability.md.fixture"),
  /** The default spec's links plus a linked eval. */
  EVAL_LINKED: join(NODE_STATUS_FIXTURE_DIRECTORY, "linked-spec-eval.md.fixture"),
} as const;

const SPEC_LINK_PATTERN = new RegExp(
  String.raw`\[(${SPEC_TREE_EVIDENCE_LINK_TEXT.TEST}|${SPEC_TREE_EVIDENCE_LINK_TEXT.EVAL})\]\(([^)\s]+)\)`,
  "g",
);
const SPEC_LINK_TEXT_GROUP = 1;
const SPEC_LINK_TARGET_GROUP = 2;
const SPEC_MALLEABILITY_PATTERN = new RegExp(String.raw`^${SPEC_CONTEXT_SELECTED_METADATA_KEY}:\s*(\S+)\s*$`, "m");
const SPEC_MALLEABILITY_GROUP = 1;
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
  /** Product-relative paths of the evals the spec links. */
  readonly evalPaths: readonly string[];
  /** The kinds of evidence the spec links, by link text, in ascending order. */
  readonly evidenceKinds: readonly string[];
  /** The malleability the spec's front matter declares; the implementation layer when it declares none. */
  readonly declaredMalleability: NodeStatusMalleability;
  /** The claim key of each test in `testPaths`, in the same order: its path relative to the node directory. */
  readonly testKeys: readonly string[];
  /** The claim key of a product-relative test path under this node. */
  testKey(path: string): string;
  /** The agent attribution a recorded result of this node carries. */
  readonly attribution: ReturnType<typeof nodeStatusAttribution>;
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
  /** The test results of a claim recording the node's first test passed, pinned over the spec, that test, and subject `subjectIndex`. */
  passedTestClaim(subjectIndex: number): NodeStatusClaimVerification;
  /** A resolver answering every consulted evidence path as passed. */
  readonly passingOutcomes: NodeOutcomeResolver;
  /** A resolver answering every requested audit rule slug and evidence kind as passed, each reading `read`. */
  passedAttributedResults(read: readonly string[]): NodeAttributedResultResolver;
  /** A resolver answering each audit rule slug of `audit` with its verdict, reading `read`, and no other result. */
  attributedResultsFor(
    audit: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
    read: readonly string[],
  ): NodeAttributedResultResolver;
  /** The resolvers of the recorded runs `runs` report, each result carrying this repository's attribution. */
  resolversOfRecordedRuns(runs: RecordedRunSets): {
    readonly resolveOutcome: NodeOutcomeResolver;
    readonly resolveReadPaths: NodeReadPathResolver;
    readonly resolveAttributedResults: NodeAttributedResultResolver;
  };
  /** Record the node's first test as passed in a committed claim, the state of which is `passing`. */
  recordPassingClaim(): Promise<void>;
  /** Write a version-1 claim of the node's first test into a sibling node directory, and return that directory. */
  writeVersionOneSiblingClaim(): Promise<string>;
  /** The node's lifecycle state as `spx spec status` reads it from the committed claim and Git history. */
  readState(): Promise<string | undefined>;
  /**
   * The node's lifecycle state after its claim recorded `passing`, and then one subject and the decision record at
   * `placement` changed together in a later commit.
   */
  stateAfterDecisionEdit(placement: DecisionPlacement): Promise<string | undefined>;
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
  /** The product-relative path of the decision record committed at `placement` with the repository. */
  decisionPath(placement: DecisionPlacement): string;
  /** Add a sentence to the decision record at `placement`. */
  editDecision(placement: DecisionPlacement): Promise<void>;
};

/**
 * Materialize and commit a node with a spec linking two tests and tagging two audit rules, the tests, and the
 * source subjects of `fixture`, in a temporary product directory under the methodology `config` declares.
 */
export async function withPinnedNodeRepository(
  fixture: PinnedNodeFixture,
  config: Config,
  callback: (repository: PinnedNodeRepository) => Promise<void>,
  specFixturePath: string = PINNED_SPEC_FIXTURE.DEFAULT,
): Promise<void> {
  await withTestEnv(config, async (env) => {
    const [specContent, testContent] = await Promise.all([
      readFixture(specFixturePath),
      readFixture(CLASSIFICATION_FIXTURE_PATHS.test),
    ]);
    const ancestorSegments = fixture.ancestor === undefined ? [] : [fixture.ancestor.dirName];
    const nodePath = nodeTreePath(...ancestorSegments, fixture.dirName);
    const specPath = `${nodePath}${PATH_SEPARATOR}${fixture.slug}${SPEC_FILE_SUFFIX}`;
    const links = [...specContent.matchAll(SPEC_LINK_PATTERN)].flatMap((match) => {
      const text = match.at(SPEC_LINK_TEXT_GROUP);
      const target = match.at(SPEC_LINK_TARGET_GROUP);
      return text === undefined || target === undefined
        ? []
        : [{ text, path: `${nodePath}${PATH_SEPARATOR}${target}` }];
    });
    const pathsLinkedAs = (text: string) => links.filter((link) => link.text === text).map((link) => link.path);
    const testPaths = pathsLinkedAs(SPEC_TREE_EVIDENCE_LINK_TEXT.TEST);
    const evalPaths = pathsLinkedAs(SPEC_TREE_EVIDENCE_LINK_TEXT.EVAL);
    const declaredMalleability = (SPEC_MALLEABILITY_PATTERN.exec(specContent)?.at(SPEC_MALLEABILITY_GROUP)
      ?? NODE_STATUS_DEFAULT_MALLEABILITY) as NodeStatusMalleability;
    if (fixture.ancestor !== undefined) {
      await env.writeNode(
        nodeTreePath(fixture.ancestor.dirName, `${fixture.ancestor.slug}${SPEC_FILE_SUFFIX}`),
        specContent,
      );
    }
    await env.writeNode(specPath, specContent);
    for (const linkedPath of [...testPaths, ...evalPaths]) await env.writeNode(linkedPath, testContent);
    for (const subjectPath of fixture.subjectPaths) await env.writeRaw(subjectPath, testContent);
    const nodeOrder = Number(fixture.dirName.split(SPEC_TREE_GRAMMAR.ORDER.SEPARATOR).at(0));
    const decisionPaths = decisionPathsAround(fixture, nodeOrder);
    for (const decisionPath of Object.values(decisionPaths)) await env.writeNode(decisionPath, specContent);
    await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
    const commit = await runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);

    const nodeId = [...ancestorSegments, fixture.dirName].join(PATH_SEPARATOR);
    const attribution = nodeStatusAttribution(fixture.slug, fixture.dirName);
    const testKeys = testPaths.map((path) => posix.relative(nodePath, path));
    const passedEntry = (read: readonly string[]): NodeStatusClaimEntry => ({
      [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
      [NODE_STATUS_CLAIM_FIELD.READ]: read,
    });
    const answeredBy = (
      verdicts: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
      read: readonly string[],
    ) =>
      Object.fromEntries(
        Object.entries(verdicts).map(([key, verdict]) => [key, { verdict, read, ...attribution }] as const),
      );
    const attributedFrom = (recorded: Readonly<Record<string, RecordedRun | undefined>>) =>
      Object.fromEntries(
        Object.entries(recorded).flatMap(([key, run]) =>
          run === undefined ? [] : [[key, { ...run, ...attribution }] as const]
        ),
      );
    const passedFor = (keys: readonly string[]) =>
      Object.fromEntries(keys.map((key) => [key, NODE_STATUS_EVIDENCE_OUTCOME.PASSED] as const));
    const commitAll = async (): Promise<string> => {
      await commitPaths(env.productDir, REPOSITORY_ROOT_PATHS);
      return runFixtureGit(env.productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    };
    const editSubject = async (index: number): Promise<void> => {
      const path = fixture.subjectPaths.at(index);
      if (path === undefined) throw new Error(`No subject at index ${index}`);
      await env.writeRaw(path, `${testContent}${SUBJECT_APPENDIX}`);
    };
    const passedTestClaim = (subjectIndex: number): NodeStatusClaimVerification => ({
      [NODE_STATUS_CLAIM_SECTION.TEST]: {
        [testKeys[0] ?? ""]: passedEntry([specPath, testPaths[0] ?? "", fixture.subjectPaths[subjectIndex] ?? ""]),
      },
    });
    const readState = async (): Promise<string | undefined> => {
      const snapshot = await readSpecTree({
        source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
        evidence: await createNodeStatusProvider(env.productDir, { gitDependencies: isolatedFixtureGitDependencies }),
      });
      return snapshot.allNodes.find((node) => node.id === nodeId)?.state;
    };
    const recordPassingClaim = async (): Promise<void> => {
      await writeClaim(env, nodePath, passedTestClaim(fixture.editedSubject), SPEC_TREE_NODE_STATE.PASSING);
      await commitAll();
    };
    const editDecision = (placement: DecisionPlacement): Promise<void> =>
      env.writeNode(decisionPathAt(decisionPaths, placement), `${specContent}${SPEC_APPENDIX}`);

    await callback({
      env,
      nodeId,
      nodePath,
      specPath,
      testPaths,
      evalPaths,
      evidenceKinds: [...new Set(links.map((link) => link.text))].sort(compareAsciiStrings),
      declaredMalleability,
      testKeys,
      testKey: (path) => posix.relative(nodePath, path),
      attribution,
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
      passedEntry,
      passedTestClaim,
      passingOutcomes: (_nodeId, evidencePaths) => Promise.resolve(passedFor(evidencePaths)),
      passedAttributedResults: (read) => (_nodeId, request) =>
        Promise.resolve({
          audit: answeredBy(passedFor(request.auditRuleSlugs), read),
          evidence: answeredBy(passedFor(request.evidenceKinds), read),
        }),
      attributedResultsFor: (audit, read) => () => Promise.resolve({ audit: answeredBy(audit, read) }),
      resolversOfRecordedRuns: (runs) => ({
        resolveOutcome: (_nodeId, evidencePaths) =>
          Promise.resolve(
            Object.fromEntries(
              evidencePaths.map((path) => [path, runs.tests[path]?.verdict ?? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN]),
            ),
          ),
        resolveReadPaths: (_nodeId, evidencePath) => Promise.resolve(runs.tests[evidencePath]?.read),
        resolveAttributedResults: () =>
          Promise.resolve({ audit: attributedFrom(runs.audit), evidence: attributedFrom(runs.evidence) }),
      }),
      writeClaim: (verification, state) => writeClaim(env, nodePath, verification, state),
      recordPassingClaim,
      writeVersionOneSiblingClaim: async () => {
        const statusPath = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.untrackedNodeStatusPath([nodeId]));
        await env.writeRaw(
          statusPath,
          serializeNodeStatus(createClaimedTestStatus([testPaths[0] ?? ""], NODE_STATUS_EVIDENCE_OUTCOME.PASSED)),
        );
        return dirname(statusPath);
      },
      readState,
      stateAfterDecisionEdit: async (placement) => {
        await recordPassingClaim();
        await editSubject(fixture.editedSubject);
        await editDecision(placement);
        await commitAll();
        return readState();
      },
      commitAll,
      commitUnrelatedFile: async () => {
        await env.writeRaw(UNRELATED_FILE_PATH, testContent);
        return commitAll();
      },
      editSubject,
      rewriteSpecLinksTreeAbsolute: () =>
        env.writeNode(
          specPath,
          specContent.replaceAll(
            `](${EVIDENCE_DIRECTORY}${PATH_SEPARATOR}`,
            `](${nodePath}${PATH_SEPARATOR}${EVIDENCE_DIRECTORY}${PATH_SEPARATOR}`,
          ),
        ),
      editSpecText: () => env.writeNode(specPath, `${specContent}${SPEC_APPENDIX}`),
      decisionPath: (placement) => decisionPathAt(decisionPaths, placement),
      editDecision,
    });
  });
}

/**
 * The lifecycle state a freshly committed pinned node reads as after its claim recorded `passing` and a later
 * commit changed one of its subjects together with the decision record at `placement`, under a current-shape
 * methodology; the observation only, with no verdict.
 */
export async function observeStateAfterDecisionEdit(
  fixture: PinnedNodeFixture,
  placement: DecisionPlacement,
): Promise<string | undefined> {
  let state: string | undefined;
  await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    state = await repository.stateAfterDecisionEdit(placement);
  });
  return state;
}

const DECISION_ORDER_BELOW_NODE = 1;
const DECISION_ORDER_ABOVE_NODE = 100;
const DECISION_FILE_SLUG = "decision";
const UNRELATED_NODE_DIRECTORY_PREFIX = "unrelated-";

function decisionPathsAround(
  fixture: PinnedNodeFixture,
  nodeOrder: number,
): Readonly<Partial<Record<DecisionPlacement, string>>> {
  const decisionFile = (order: number) =>
    `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${DECISION_FILE_SLUG}${KIND_REGISTRY.adr.suffix}`;
  const { ancestor } = fixture;
  const rootOrder = ancestor === undefined
    ? nodeOrder
    : Number(ancestor.dirName.split(SPEC_TREE_GRAMMAR.ORDER.SEPARATOR).at(0));
  const own = {
    [DECISION_PLACEMENT.OWN_DIRECTORY]: nodeTreePath(
      ...(ancestor === undefined ? [] : [ancestor.dirName]),
      fixture.dirName,
      decisionFile(nodeOrder),
    ),
    [DECISION_PLACEMENT.ROOT_LOWER_INDEX]: nodeTreePath(decisionFile(DECISION_ORDER_BELOW_NODE)),
    [DECISION_PLACEMENT.ROOT_SAME_INDEX]: nodeTreePath(decisionFile(rootOrder)),
    [DECISION_PLACEMENT.ROOT_HIGHER_INDEX]: nodeTreePath(decisionFile(DECISION_ORDER_ABOVE_NODE)),
    [DECISION_PLACEMENT.UNRELATED_NODE]: nodeTreePath(
      `${UNRELATED_NODE_DIRECTORY_PREFIX}${ancestor?.dirName ?? fixture.dirName}`,
      decisionFile(nodeOrder),
    ),
  };
  if (ancestor === undefined) return own;
  return {
    ...own,
    [ANCESTOR_DECISION_PLACEMENT.ANCESTOR_LOWER_INDEX]: nodeTreePath(
      ancestor.dirName,
      decisionFile(DECISION_ORDER_BELOW_NODE),
    ),
    [ANCESTOR_DECISION_PLACEMENT.ANCESTOR_SAME_INDEX]: nodeTreePath(ancestor.dirName, decisionFile(nodeOrder)),
    [ANCESTOR_DECISION_PLACEMENT.ANCESTOR_HIGHER_INDEX]: nodeTreePath(
      ancestor.dirName,
      decisionFile(DECISION_ORDER_ABOVE_NODE),
    ),
  };
}

function decisionPathAt(
  paths: Readonly<Partial<Record<DecisionPlacement, string>>>,
  placement: DecisionPlacement,
): string {
  const path = paths[placement];
  if (path === undefined) throw new Error(`The node has no decision placed at ${placement}`);
  return path;
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

/** A committed parent with variants whose committed claims record each variant's passed or failed result. */
export type VariantTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly parentId: string;
  readonly variants: readonly { readonly nodeId: string; readonly passes: boolean }[];
  readonly git: GitDependencies;
  /**
   * Write the parent's claim through `updateNodeStatus`, then commit-pin to each variant's directory a claim whose
   * test and evidence results are passed when the variant passes and failed otherwise, each reading the variant's
   * spec, test, and source subject. The variants' claims are written after the update because the update rewrites
   * only the status files of directories the spec-tree source reads as nodes.
   */
  recordClaims(): Promise<void>;
};

function leadingGrammarToken(tokens: readonly string[]): string {
  const token = tokens.at(0);
  if (token === undefined) throw new Error("The spec-tree evidence grammar declares no tokens");
  return token;
}

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
        [
          variant.slug,
          leadingGrammarToken(SPEC_TREE_EVIDENCE_FILE.MODES),
          leadingGrammarToken(SPEC_TREE_EVIDENCE_FILE.LEVELS),
          ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT,
        ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR),
      ].join(PATH_SEPARATOR);
      return {
        ...variant,
        nodeId: `${fixture.parentDirName}${PATH_SEPARATOR}${variant.dirName}`,
        nodePath,
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
    await callback({
      env,
      parentId: fixture.parentDirName,
      variants: variants.map((variant) => ({ nodeId: variant.nodeId, passes: variant.passes })),
      git: isolatedFixtureGitDependencies,
      recordClaims: async () => {
        await updateNodeStatus({
          productDir: env.productDir,
          gitDependencies: isolatedFixtureGitDependencies,
          resolveOutcome: () => Promise.resolve({}),
        });
        for (const variant of variants) {
          const entry: NodeStatusClaimEntry = {
            [NODE_STATUS_CLAIM_FIELD.VERDICT]: variant.passes
              ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
              : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
            [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
            [NODE_STATUS_CLAIM_FIELD.READ]: [variant.specPath, variant.testPath, variant.subjectPath].sort(
              compareAsciiStrings,
            ),
          };
          await writeClaim(
            env,
            variant.nodePath,
            {
              [NODE_STATUS_CLAIM_SECTION.TEST]: { [posix.relative(variant.nodePath, variant.testPath)]: entry },
              [NODE_STATUS_CLAIM_SECTION.EVIDENCE]: {
                [NODE_STATUS_CLAIM_SECTION.TEST]: {
                  ...entry,
                  ...nodeStatusAttribution(fixture.parentSlug, fixture.parentDirName),
                },
              },
            },
            variant.passes ? SPEC_TREE_NODE_STATE.PASSING : SPEC_TREE_NODE_STATE.SPECIFIED,
          );
        }
      },
    });
  });
}

/**
 * The committed claim set of a comparison fixture: every node holds a passing 4.0 claim whose test entries and
 * audit entry are passed and pinned to the fixture's first commit over its read paths, the audit entry carrying
 * the fixture's first actor and run.
 */
export function committedClaimSet(fixture: ClaimComparisonFixture): ReadonlyMap<string, NodeStatusClaim> {
  const [commit] = fixture.commits;
  const passed = (): NodeStatusClaimEntry => ({
    [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
    [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
    [NODE_STATUS_CLAIM_FIELD.READ]: fixture.readPaths,
  });
  return new Map(
    fixture.nodeIds.map((nodeId): [string, NodeStatusClaim] => [nodeId, {
      [NODE_STATUS_CLAIM_FIELD.STATE]: SPEC_TREE_NODE_STATE.PASSING,
      [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: NODE_STATUS_DEFAULT_MALLEABILITY,
      [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: {
        [NODE_STATUS_CLAIM_SECTION.TEST]: Object.fromEntries(fixture.testKeys.map((key) => [key, passed()])),
        [NODE_STATUS_CLAIM_SECTION.AUDIT]: {
          [fixture.auditSlug]: {
            ...passed(),
            ...nodeStatusAttribution(fixture.actorIds[0], fixture.runs[0]),
          },
        },
      },
    }]),
  );
}

/** A copy of `claims` in which the claim of `nodeId` records `state`. */
export function withClaimState(
  claims: ReadonlyMap<string, NodeStatusClaim>,
  nodeId: string,
  state: SpecTreeNodeState,
): ReadonlyMap<string, NodeStatusClaim> {
  return replaceClaim(claims, nodeId, (claim) => ({ ...claim, [NODE_STATUS_CLAIM_FIELD.STATE]: state }));
}

/** A copy of `claims` in which the entry of `nodeId` at `section` and `key` is replaced by `change` applied to it. */
export function withClaimEntry(
  claims: ReadonlyMap<string, NodeStatusClaim>,
  location: { readonly nodeId: string; readonly section: NodeStatusClaimSection; readonly key: string },
  change: (entry: NodeStatusClaimEntry) => NodeStatusClaimEntry,
): ReadonlyMap<string, NodeStatusClaim> {
  return replaceClaim(claims, location.nodeId, (claim) => {
    const verification = claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION];
    const entries = verification[location.section] ?? {};
    const entry = entries[location.key];
    if (entry === undefined) throw new Error(`No ${location.section} entry ${location.key} in node ${location.nodeId}`);
    return {
      ...claim,
      [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: {
        ...verification,
        [location.section]: { ...entries, [location.key]: change(entry) },
      },
    };
  });
}

function replaceClaim(
  claims: ReadonlyMap<string, NodeStatusClaim>,
  nodeId: string,
  change: (claim: NodeStatusClaim) => NodeStatusClaim,
): ReadonlyMap<string, NodeStatusClaim> {
  const claim = claims.get(nodeId);
  if (claim === undefined) throw new Error(`No claim for node ${nodeId}`);
  return new Map([...claims, [nodeId, change(claim)]]);
}
