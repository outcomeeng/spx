import { describe, expect, it } from "vitest";

import { GIT_LS_FILES_COMMAND } from "@/lib/git/changed-paths";
import { GIT_NULL_DELIMITED_FLAG } from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { listTrackedPaths } from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import {
  createAnsweringGitDependencies,
  createFailingGitDependencies,
  withStagedRepository,
} from "@testing/harnesses/node-status/tracked-paths";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";

describe("the tracked-path query maps each git ls-files runner outcome to a tracked set or none", () => {
  it(
    "maps a successful `git ls-files -z` listing run in the product directory to the set of the files staged there",
    async () => {
      await assertProperty(
        NODE_STATUS_TEST_GENERATOR.stagedTrackedFiles(),
        async (stagedFiles) => {
          await withStagedRepository(stagedFiles, async ({ productDir, git }) => {
            await expect(listTrackedPaths(productDir, git.deps)).resolves.toEqual(stagedFiles);
            expect(git.invocations).toEqual([
              {
                executable: GIT_ROOT_COMMAND.EXECUTABLE,
                args: [GIT_LS_FILES_COMMAND, GIT_NULL_DELIMITED_FLAG],
                cwd: productDir,
              },
            ]);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it("maps every non-zero exit code to no tracked set, whatever the run printed", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.nonSuccessGitExit(),
      async ({ productDir, exitCode, stdout }) => {
        await expect(
          listTrackedPaths(productDir, createAnsweringGitDependencies({ exitCode, stdout })),
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
