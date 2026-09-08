import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { RECORDING_COMMAND_RUNNER_GENERATOR } from "@testing/generators/testing/recording-command-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";
import { observeRecordingCommandRunner } from "@testing/harnesses/testing/recording-command-runner";

describe("python recording command runner", () => {
  it("reports configured presence, records each invocation in order, and returns the configured exit code", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    await assertProperty(
      fc.tuple(
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        RECORDING_COMMAND_RUNNER_GENERATOR.invocations(),
      ),
      async ([present, exitCode, invocations]) => {
        const observation = await observeRecordingCommandRunner(
          createRecordingCommandRunner,
          { present, exitCode, invocations },
          productDir,
        );

        expect(observation.reportedPresence).toBe(present);
        expect(observation.exitCodes).toEqual(invocations.map(() => exitCode));
        expect(observation.calls).toEqual(invocations);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

describe("python runner test-path generator", () => {
  it("yields a non-empty list of distinct python test paths", () => {
    assertProperty(
      PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths(),
      (paths) => {
        expect(paths.length).toBeGreaterThan(0);
        expect(new Set(paths).size).toBe(paths.length);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
