import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_TESTING_STORAGE, testingRunsDir } from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

// Resolves the runs directory for a branch under a temp product directory.
export function testingBranchRunsDir(productDir: string, branchSlug: string): string {
  return testingRunsDir(productDir, branchSlug);
}

// Provides a temp product directory and removes it after the callback settles.
export async function withTestingTempProductDir(
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  try {
    await callback(productDir);
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

// Writes a raw state file at a chosen run directory, bypassing the write protocol so
// read-side tests can stage controlled, including malformed, state content.
export async function writeTestingStateFile(
  productDir: string,
  branchSlug: string,
  runDirectoryName: string,
  rawState: string,
): Promise<string> {
  const runDir = join(testingRunsDir(productDir, branchSlug), runDirectoryName);
  await mkdir(runDir, { recursive: true });
  const statePath = join(runDir, DEFAULT_TESTING_STORAGE.stateFile);
  await writeFile(statePath, rawState);
  return statePath;
}
