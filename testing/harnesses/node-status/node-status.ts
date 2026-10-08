import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { type RecordedTestRun, runNodeCommand } from "@/commands/test";
import { GIT_STATUS_PORCELAIN_ARGS } from "@/lib/git/root";
import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeOutcomeResolver,
  type NodeStatusEvidenceOutcome,
  serializeNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import type {
  ClassificationFixtureFacts,
  ClassificationTreeFixture,
  StatusWriterTreeFixture,
  StatusWriterTreeNode,
} from "@testing/generators/node-status/node-status";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
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
 * Porcelain v1 prefixes each path with a two-character status code and a space; the
 * git reader trims output, so the first line's code may have lost a leading blank.
 */
const GIT_PORCELAIN_STATUS_PREFIX = /^\S{1,2} /u;
const LINE_SEPARATOR = "\n";

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
 * status claims — then initialize a git repository and stage the spec tree, so every
 * node directory is git-tracked when the callback runs.
 */
export async function withStatusWriterTree(
  fixture: StatusWriterTreeFixture,
  callback: (tree: StatusWriterTreeEnv) => Promise<void>,
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

    await trackSpecTree(env.productDir);
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

/** Initialize a git repository in `productDir` and stage the spec tree, leaving it tracked but uncommitted. */
export async function trackSpecTree(productDir: string): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ROOT]);
}

/** Stage and commit the spec tree in an initialized repository under a fixed test identity. */
export async function commitSpecTree(productDir: string): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ROOT]);
  await runGit(productDir, [
    GIT_TEST_FLAGS.CONFIG_OVERRIDE,
    `${GIT_TEST_CONFIG.USER_NAME_KEY}=${GIT_TEST_CONFIG.USER_NAME}`,
    GIT_TEST_FLAGS.CONFIG_OVERRIDE,
    `${GIT_TEST_CONFIG.EMAIL_KEY}=${GIT_TEST_CONFIG.EMAIL}`,
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.QUIET,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    NODE_STATUS_FIXTURE_COMMIT_MESSAGE,
  ]);
}

/**
 * The spec-tree paths git reports as changed against the last commit — modified,
 * staged, or untracked — read through the production working-tree status command.
 */
export async function readSpecTreeWorkingChanges(productDir: string): Promise<readonly string[]> {
  const porcelain = await readGit(productDir, [...GIT_STATUS_PORCELAIN_ARGS]);
  const specTreePrefix = `${ROOT}${PATH_SEPARATOR}`;
  return porcelain.split(LINE_SEPARATOR).filter((line) => line.length > 0).map((line) =>
    line.replace(GIT_PORCELAIN_STATUS_PREFIX, "")
  ).filter((path) => path.startsWith(specTreePrefix));
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
