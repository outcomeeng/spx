import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DEFAULT_TESTING_STORAGE, testingRunsDir } from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

// Provides a temp product directory and removes it after the callback settles.
export function withTestingTempProductDir(
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  return withTempDir(sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix()), callback);
}

// Materializes an empty test-file fixture at a spec-tree-relative path so the
// dispatch's filesystem discovery finds it; discovery keys on the path, not content.
export async function writeTestFileFixture(productDir: string, relativePath: string): Promise<void> {
  const absolute = join(productDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, "");
}

// Writes a raw state file at a chosen run directory, bypassing the write protocol so
// read-side tests can stage controlled, including malformed, state content.
export async function writeTestingStateFile(
  productDir: string,
  runDirectoryName: string,
  rawState: string,
): Promise<string> {
  const runDir = join(testingRunsDir(productDir), runDirectoryName);
  await mkdir(runDir, { recursive: true });
  const statePath = join(runDir, DEFAULT_TESTING_STORAGE.stateFile);
  await writeFile(statePath, rawState);
  return statePath;
}
