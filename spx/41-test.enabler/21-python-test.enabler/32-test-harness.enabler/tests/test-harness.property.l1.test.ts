import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";
import { assertRecordingCommandRunnerContract } from "@testing/harnesses/testing/recording-command-runner";

describe("python recording command runner", () => {
  it("reports configured presence, records each invocation in order, and returns the configured exit code", async () => {
    await assertRecordingCommandRunnerContract(
      createRecordingCommandRunner,
      { present: PYTHON_RUNNER_TEST_GENERATOR.present(), exitCode: PYTHON_RUNNER_TEST_GENERATOR.exitCode() },
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
    );
  });
});

describe("python runner test-path generator", () => {
  it("yields a non-empty list of distinct python test paths", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths(), (paths) => {
        expect(paths.length).toBeGreaterThan(0);
        expect(new Set(paths).size).toBe(paths.length);
      }),
    );
  });
});
