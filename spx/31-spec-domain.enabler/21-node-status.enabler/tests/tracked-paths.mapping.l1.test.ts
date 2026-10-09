import { describe, expect, it } from "vitest";

import { GIT_SUCCESS_EXIT_CODE, listTrackedPaths, TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { GIT_TEST_COMMAND, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import {
  createFailingGitDependencies,
  createObservingGitDependencies,
} from "@testing/harnesses/node-status/tracked-paths";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("the tracked-path query maps each git ls-files runner outcome to a tracked set or none", () => {
  it("maps a successful `git ls-files -z` listing run in the product directory to the set of the listed paths", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.trackedPathListing(),
      async ({ productDir, trackedFiles }) => {
        const git = createObservingGitDependencies({
          exitCode: GIT_SUCCESS_EXIT_CODE,
          stdout: [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join(""),
          stderr: "",
        });

        await expect(listTrackedPaths(productDir, git.deps)).resolves.toEqual(trackedFiles);
        expect(git.invocations).toEqual([
          {
            executable: GIT_TEST_COMMAND,
            args: [GIT_TEST_SUBCOMMANDS.LS_FILES, GIT_TEST_FLAGS.NUL_TERMINATED],
            cwd: productDir,
          },
        ]);
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
            createObservingGitDependencies({
              exitCode,
              stdout: [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join(""),
              stderr: "",
            }).deps,
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
