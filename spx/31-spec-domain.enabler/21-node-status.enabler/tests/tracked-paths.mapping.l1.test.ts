import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ExecResult, GitDependencies } from "@/lib/git/root";
import {
  GIT_SUCCESS_EXIT_CODE,
  listTrackedPaths,
  TRACKED_PATH_DIRECTORY_SEPARATOR,
  TRACKED_PATH_NUL_SEPARATOR,
} from "@/lib/git/tracked-paths";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

const trackedFile = fc
  .array(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join(TRACKED_PATH_DIRECTORY_SEPARATOR));
const trackedFileSet = fc.array(trackedFile, { minLength: 0, maxLength: 6 }).map((files) => new Set(files));

function gitDependenciesReturning(result: ExecResult): GitDependencies {
  return { execa: () => Promise.resolve(result) };
}

describe("listTrackedPaths", () => {
  it("maps a successful git ls-files run to the set of NUL-separated tracked paths", async () => {
    await fc.assert(
      fc.asyncProperty(trackedFileSet, async (trackedFiles) => {
        const stdout = [...trackedFiles].map((file) => `${file}${TRACKED_PATH_NUL_SEPARATOR}`).join("");
        const deps = gitDependenciesReturning({ exitCode: GIT_SUCCESS_EXIT_CODE, stdout, stderr: "" });
        const productDir = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
        expect(await listTrackedPaths(productDir, deps)).toEqual(trackedFiles);
      }),
    );
  });

  it("maps a non-zero git ls-files exit (outside a git repository) to undefined", async () => {
    const deps = gitDependenciesReturning({ exitCode: GIT_SUCCESS_EXIT_CODE + 1, stdout: "", stderr: "" });
    const productDir = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    expect(await listTrackedPaths(productDir, deps)).toBeUndefined();
  });

  it("maps a git runner failure (git executable unavailable) to undefined", async () => {
    const deps: GitDependencies = {
      execa: () => Promise.reject(new Error(sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()))),
    };
    const productDir = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    expect(await listTrackedPaths(productDir, deps)).toBeUndefined();
  });
});
