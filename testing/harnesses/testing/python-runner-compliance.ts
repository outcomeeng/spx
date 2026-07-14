import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pythonTestingLanguage } from "@/test/languages/python";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

export function registerPythonRunnerCompliance(): void {
  describe("python test runner gating on Python presence", () => {
    it("ALWAYS: invokes pytest exactly when Python is present", async () => {
      await assertProperty(
        PYTHON_RUNNER_TEST_GENERATOR.presenceAndExitCode(),
        async ([present, exitCode]) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
          const runner = createRecordingCommandRunner({ present, exitCode });

          const result = await pythonTestingLanguage.runTests(
            { productDir, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(present);
          expect(runner.calls).toHaveLength(present ? 1 : 0);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("ALWAYS: detect reflects the injected Python presence predicate", () => {
      assertProperty(
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        (present) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
          expect(pythonTestingLanguage.detect(productDir, { isLanguagePresent: () => present })).toBe(present);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("ALWAYS: detect falls back to marker-based Python detection without an override", async () => {
      await withTestingTempProductDir(async (productDir) => {
        expect(pythonTestingLanguage.detect(productDir)).toBe(false);

        await writeFile(join(productDir, PYTHON_MARKER), "");

        expect(pythonTestingLanguage.detect(productDir)).toBe(true);
      });
    });
  });
}

export const pythonRunnerComplianceCases = collectHarnessTestCases(registerPythonRunnerCompliance);
