import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CONFIG_FILENAMES } from "@/config/index";
import type { PathFilterConfig } from "@/config/primitives/path-filter";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION } from "@/testing/config";
import { testingRunsDir } from "@/testing/run-state";
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

// Writes a spx.config.json carrying the testing passing scope so the command reads
// it through the real config descriptor pipeline rather than an injected value.
export async function writeTestingConfig(
  productDir: string,
  passingScope: PathFilterConfig,
): Promise<void> {
  const config = { [TESTING_SECTION]: { [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: passingScope } };
  await writeFile(join(productDir, CONFIG_FILENAMES.json), JSON.stringify(config));
}

// Writes a raw run file at a chosen name, bypassing the write protocol so
// read-side tests can stage controlled, including malformed, JSONL content.
export async function writeTestingStateFile(
  productDir: string,
  runFileName: string,
  rawState: string,
): Promise<string> {
  const runsDir = testingRunsDir(productDir);
  await mkdir(runsDir, { recursive: true });
  const runFilePath = join(runsDir, runFileName);
  await writeFile(runFilePath, rawState);
  return runFilePath;
}
