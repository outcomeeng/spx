import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/testing/languages/python";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";

describe("python test runner gating on Python presence", () => {
  it("ALWAYS: invokes pytest exactly when Python is present", async () => {
    await fc.assert(
      fc.asyncProperty(
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        async (present, exitCode) => {
          const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
          const runner = createRecordingCommandRunner({ present, exitCode });

          const result = await pythonTestingLanguage.runTests(
            { projectRoot, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(present);
          expect(runner.calls).toHaveLength(present ? 1 : 0);
        },
      ),
    );
  });

  it("ALWAYS: detect reflects the injected Python presence predicate", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.present(), (present) => {
        const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
        expect(pythonTestingLanguage.detect(projectRoot, { isLanguagePresent: () => present })).toBe(present);
      }),
    );
  });
});
