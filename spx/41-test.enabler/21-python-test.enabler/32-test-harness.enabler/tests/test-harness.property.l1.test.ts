import * as fc from "fast-check";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";
import { RECORDING_COMMAND_RUNNER_GENERATOR } from "@testing/generators/testing/recording-command-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";
import { EXPECTED_PYTEST_TEST_FILE_BASENAME } from "@testing/harnesses/testing/python-test-file-shape";
import { observeRecordingCommandRunner } from "@testing/harnesses/testing/recording-command-runner";

/** Whether no path occurs twice in the list; a list that repeats any path fails it. */
function holdsDistinctPaths(paths: readonly string[]): boolean {
  return paths.every((path, index) => paths.indexOf(path) === index);
}

describe("python recording command runner", () => {
  it("reports configured presence, records each invocation in order, and returns the configured exit code", async () => {
    await assertProperty(
      fc.tuple(
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        RECORDING_COMMAND_RUNNER_GENERATOR.invocations(),
        CONFIG_TEST_GENERATOR.productDir(),
      ),
      async ([present, exitCode, invocations, productDir]) => {
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
        for (const path of paths) {
          expect(posix.basename(path)).toMatch(EXPECTED_PYTEST_TEST_FILE_BASENAME);
        }
        expect(holdsDistinctPaths(paths)).toBe(true);
        expect(holdsDistinctPaths([...paths, ...paths.slice(0, 1)])).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
