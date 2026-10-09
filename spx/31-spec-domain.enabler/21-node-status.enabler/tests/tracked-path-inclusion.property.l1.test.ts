import { describe, expect, it } from "vitest";

import { createTrackedPathInclusion, TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("createTrackedPathInclusion", () => {
  it("admits a path exactly when it is a tracked file or an ancestor directory of one", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.trackedFileSet().chain((trackedFiles) =>
        NODE_STATUS_TEST_GENERATOR.trackedFile().map((probe) => ({ probe, trackedFiles }))
      ),
      ({ probe, trackedFiles }) => {
        expect(createTrackedPathInclusion(trackedFiles)(probe)).toBe(
          trackedFiles.has(probe)
            || [...trackedFiles].some((file) => file.startsWith(`${probe}${TRACKED_PATH_DIRECTORY_SEPARATOR}`)),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("admits every path when no tracked set is available", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.trackedFile(),
      (path) => {
        expect(createTrackedPathInclusion(undefined)(path)).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
