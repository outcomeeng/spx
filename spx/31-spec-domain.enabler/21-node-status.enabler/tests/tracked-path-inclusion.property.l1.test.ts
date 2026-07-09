import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTrackedPathInclusion, TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

const trackedFile = fc
  .array(SPEC_TREE_TEST_GENERATOR.sourceSlug(), { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join(TRACKED_PATH_DIRECTORY_SEPARATOR));
const trackedFileSet = fc.array(trackedFile, { minLength: 0, maxLength: 6 }).map((files) => new Set(files));

describe("createTrackedPathInclusion", () => {
  it("admits a path exactly when it is a tracked file or an ancestor directory of one", () => {
    fc.assert(
      fc.property(trackedFileSet, trackedFile, (trackedFiles, probe) => {
        const includes = createTrackedPathInclusion(trackedFiles);
        const expected = trackedFiles.has(probe)
          || [...trackedFiles].some((file) => file.startsWith(`${probe}${TRACKED_PATH_DIRECTORY_SEPARATOR}`));
        expect(includes(probe)).toBe(expected);
      }),
    );
  });

  it("admits every path when no tracked set is available", () => {
    fc.assert(
      fc.property(trackedFile, (anyPath) => {
        expect(createTrackedPathInclusion(undefined)(anyPath)).toBe(true);
      }),
    );
  });
});
