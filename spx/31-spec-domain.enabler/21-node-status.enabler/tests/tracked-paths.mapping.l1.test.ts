import { describe, expect, it } from "vitest";

import { GIT_SUCCESS_EXIT_CODE, listTrackedPaths, TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import {
  createFailingGitDependencies,
  createGitDependenciesReturning,
} from "@testing/harnesses/node-status/tracked-paths";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the tracked-path query maps each git ls-files runner outcome to a tracked set or none", () => {
  it("maps a successful NUL-terminated listing to the set of the listed paths", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.trackedPathListing(),
      async ({ productDir, trackedFiles }) => {
        await expect(
          listTrackedPaths(
            productDir,
            createGitDependenciesReturning({
              exitCode: GIT_SUCCESS_EXIT_CODE,
              stdout: [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join(""),
              stderr: "",
            }),
          ),
        ).resolves.toEqual(trackedFiles);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps every non-zero exit code to no tracked set, whatever the run printed", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.nonSuccessGitExit(),
      async ({ productDir, exitCode, trackedFiles }) => {
        await expect(
          listTrackedPaths(
            productDir,
            createGitDependenciesReturning({
              exitCode,
              stdout: [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join(""),
              stderr: "",
            }),
          ),
        ).resolves.toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps an unavailable git runner to no tracked set", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.gitRunnerFailure(),
      async ({ productDir, cause }) => {
        await expect(listTrackedPaths(productDir, createFailingGitDependencies(cause))).resolves.toBeUndefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
