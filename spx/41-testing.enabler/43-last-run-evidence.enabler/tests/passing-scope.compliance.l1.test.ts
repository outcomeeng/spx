import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { TESTING_SECTION, testingConfigDescriptor } from "@/testing/config";
import { readTestingRuns, testingRunsDir } from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { withTestingTempProductDir, writeTestingStateFile } from "@testing/harnesses/testing/harness";

function resolvePassingScope(sectionValue: unknown): unknown {
  const result = testingConfigDescriptor.validate(sectionValue);
  if (!result.ok) throw new Error(result.error);
  return result.value.passingScope;
}

describe("passing scope is policy from config, never inferred from last-run state", () => {
  it("ALWAYS: deleting state empties fast status while config-derived passing scope is unchanged", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
    const sectionValue = generated.config[TESTING_SECTION];
    const passingScopeBefore = resolvePassingScope(sectionValue);

    const runDirectoryName = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const state = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(productDir, runDirectoryName, JSON.stringify(state));

      const withState = await readTestingRuns(productDir);
      expect(withState.ok).toBe(true);
      if (!withState.ok) throw new Error(withState.error);
      expect(withState.value.terminalRuns.length).toBe(1);
      expect(resolvePassingScope(sectionValue)).toEqual(passingScopeBefore);

      await rm(testingRunsDir(productDir), { recursive: true, force: true });

      const afterDelete = await readTestingRuns(productDir);
      expect(afterDelete.ok).toBe(true);
      if (!afterDelete.ok) throw new Error(afterDelete.error);
      expect(afterDelete.value.terminalRuns.length).toBe(0);
      expect(resolvePassingScope(sectionValue)).toEqual(passingScopeBefore);
    });
  });
});
