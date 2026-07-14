import { expect } from "vitest";

import type { ExecResult, GitDependencies } from "@/lib/git/root";
import {
  createTrackedPathInclusion,
  GIT_SUCCESS_EXIT_CODE,
  listTrackedPaths,
  TRACKED_PATH_DIRECTORY_SEPARATOR,
  TRACKED_PATH_NUL_SEPARATOR,
} from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR, sampleNodeStatusValue } from "@testing/generators/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

export function assertTrackedPathInclusionMatchesTrackedAncestors(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.trackedFileSet().chain((trackedFiles) =>
      NODE_STATUS_TEST_GENERATOR.trackedFile().map((probe) => ({ probe, trackedFiles }))
    ),
    ({ probe, trackedFiles }) => {
      const includes = createTrackedPathInclusion(trackedFiles);
      const expected = trackedFiles.has(probe)
        || [...trackedFiles].some((file) => file.startsWith(`${probe}${TRACKED_PATH_DIRECTORY_SEPARATOR}`));
      expect(includes(probe)).toBe(expected);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertMissingTrackedPathSetIncludesEveryPath(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.trackedFile(),
    (path) => {
      expect(createTrackedPathInclusion(undefined)(path)).toBe(true);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export async function assertSuccessfulTrackedPathListing(): Promise<void> {
  await assertProperty(
    NODE_STATUS_TEST_GENERATOR.trackedFileSet(),
    async (trackedFiles) => {
      const stdout = [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join("");
      const deps = gitDependenciesReturning({ exitCode: GIT_SUCCESS_EXIT_CODE, stdout, stderr: "" });
      const productDir = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.trackedFile());
      await expect(listTrackedPaths(productDir, deps)).resolves.toEqual(trackedFiles);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export async function assertFailedTrackedPathListingReturnsUndefined(): Promise<void> {
  await expect(
    listTrackedPaths(
      sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.trackedFile()),
      gitDependenciesReturning({ exitCode: GIT_SUCCESS_EXIT_CODE + 1, stdout: "", stderr: "" }),
    ),
  ).resolves.toBeUndefined();
}

export async function assertUnavailableGitReturnsUndefined(): Promise<void> {
  await expect(
    listTrackedPaths(
      sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.trackedFile()),
      {
        execa: () => Promise.reject(new Error(sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.trackedFile()))),
      },
    ),
  ).resolves.toBeUndefined();
}

function gitDependenciesReturning(result: ExecResult): GitDependencies {
  return { execa: () => Promise.resolve(result) };
}
