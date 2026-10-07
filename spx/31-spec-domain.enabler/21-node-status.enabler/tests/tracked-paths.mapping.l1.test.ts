import { describe, expect, it } from "vitest";

import { GIT_SUCCESS_EXIT_CODE, listTrackedPaths, TRACKED_PATH_NUL_SEPARATOR } from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createFailingGitDependencies,
  createGitDependenciesReturning,
} from "@testing/harnesses/node-status/tracked-paths";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("listTrackedPaths", () => {
  it("maps a successful NUL-terminated git ls-files listing to the set of tracked paths", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.trackedFileSet(),
      async (trackedFiles) => {
        await expect(
          listTrackedPaths(
            sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.trackedFile()),
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

  it("maps a non-zero git ls-files exit (outside a git repository) to no tracked set", async () => {
    await expect(
      listTrackedPaths(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.trackedFile()),
        createGitDependenciesReturning({ exitCode: GIT_SUCCESS_EXIT_CODE + 1, stdout: "", stderr: "" }),
      ),
    ).resolves.toBeUndefined();
  });

  it("maps a git runner failure (git executable unavailable) to no tracked set", async () => {
    await expect(
      listTrackedPaths(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.trackedFile()),
        createFailingGitDependencies(new Error(sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.trackedFile()))),
      ),
    ).resolves.toBeUndefined();
  });
});
