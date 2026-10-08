import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { type RecordedTestRun, runNodeCommand } from "@/commands/test";
import { GIT_STATUS_PORCELAIN_ARGS } from "@/lib/git/root";
import {
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FILENAME,
  type NodeOutcomeResolver,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { ClassificationFixtureFacts, ClassificationTreeFixture } from "@testing/generators/node-status/node-status";
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
    const excludedDirs: string[] = [];
    const expectations: ClassificationTreeNodeExpectation[] = [];

    for (const node of fixture.nodes) {
      await env.writeNode(nodeTreePath(node.dirName, `${node.slug}${SPEC_FILE_SUFFIX}`), specContent);
      let evidencePath: string | undefined;

      if (node.evidenceReference !== undefined) {
        evidencePath = nodeTreePath(node.dirName, node.evidenceReference);
        await env.writeNode(evidencePath, testContent);
      }

      if (node.facts.isExcluded) {
        excludedDirs.push(node.dirName);
      }

      expectations.push({
        nodeId: node.dirName,
        slug: node.slug,
        facts: node.facts,
        evidencePaths: evidencePath === undefined ? [] : [evidencePath],
        statusPath: nodeTreePath(node.dirName, NODE_STATUS_FILENAME),
      });
    }

    if (excludedDirs.length > 0) {
      await env.writeRaw(
        nodeTreePath(NODE_STATUS_EXCLUDE_FILENAME),
        `${excludedDirs.join(EXCLUDE_ENTRY_SEPARATOR)}${EXCLUDE_ENTRY_SEPARATOR}`,
      );
    }

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
