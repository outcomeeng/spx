/**
 * Fixtures for exercising the `spx spec status --update` fold.
 *
 * The fold reads recorded verification evidence and never produces it, so a fold
 * fixture seeds evidence through the testing surface that owns it — the same
 * `runTestsCommand` path `spx test` takes — and then observes what the fold wrote.
 */
import { readdir } from "node:fs/promises";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { runTestsCommand } from "@/commands/test";
import type { NodeOutcomeResolver } from "@/lib/node-status";
import { getKindDefinition, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { PYTHON_TEST_FILE_PREFIX } from "@/test/languages/python";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir, type TestRunStateFileSystem } from "@/test/run-state";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import type { CurrentSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

const SPEC_TREE_PATH_SEPARATOR = "/";

/** How a seeded run's command runner behaves for the languages it dispatches. */
export type RecordedRunnerBehavior = {
  readonly present: boolean;
  readonly exitCode: number;
};

/** Composes the node path a spec-tree fixture node occupies under `spx/`. */
export function formatNodePath(order: number, slug: string, kind: NodeKind): string {
  return `${order}-${slug}${getKindDefinition(kind).suffix}`;
}

/**
 * Writes a spec-tree TypeScript evidence file (`<slug>.<mode>.<level>.test.ts`) under
 * the node, so the node both reaches the test-outcome stage `readSpecTree` recognizes
 * and is dispatched by the TypeScript runner.
 */
export async function addNodeTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  return addNodeEvidenceFile(env, nodePath, SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT, "");
}

/**
 * Writes a spec-tree Python evidence file (`test_<slug>.<mode>.<level>.py`) under the
 * node, so the node carries a second-language test path a gated-out Python runner
 * leaves unexecuted.
 */
export async function addNodePythonTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  return addNodeEvidenceFile(env, nodePath, SPEC_TREE_EVIDENCE_FILE.TAILS.PYTHON, PYTHON_TEST_FILE_PREFIX);
}

async function addNodeEvidenceFile(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  tailSegments: readonly string[],
  filePrefix: string,
): Promise<string> {
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const tail = tailSegments.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  const evidenceFile = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    `${filePrefix}${slug}.${mode}.${level}.${tail}`,
  ].join(SPEC_TREE_PATH_SEPARATOR);
  await writeTestFileFixture(env.productDir, evidenceFile);
  return evidenceFile;
}

/**
 * Records a full-product run through the real testing surface, so the fold has
 * recorded evidence to read. Only the OS-level command execution is supplied by the
 * recording runner; staleness digests and run-state recording execute for real.
 */
export async function recordTestRun(
  env: CurrentSpecTreeEnv,
  behavior: RecordedRunnerBehavior,
): Promise<void> {
  const commandRunner = createRecordingCommandRunner(behavior);
  await runTestsCommand(
    { productDir: env.productDir, passing: false },
    { registry: testingRegistry, runnerDepsFor: () => commandRunner },
  );
}

/**
 * Builds the production node-outcome resolver the fold injects. It composes no
 * runner, so the fold is exercised through the real recorded-evidence path.
 */
export function foldResolverFor(fs?: TestRunStateFileSystem): (productDir: string) => NodeOutcomeResolver {
  return (productDir) => createNodeOutcomeResolver({ productDir, registry: testingRegistry, ...(fs && { fs }) });
}

/**
 * The run files recorded under the product's testing runs directory. Every executed
 * run mints a new run file, so an unchanged set is the observable that falsifies
 * "the fold executed verification".
 */
export async function recordedRunFiles(env: CurrentSpecTreeEnv): Promise<readonly string[]> {
  try {
    const entries = await readdir(testingRunsDir(env.productDir));
    return [...entries].sort();
  } catch {
    return [];
  }
}
