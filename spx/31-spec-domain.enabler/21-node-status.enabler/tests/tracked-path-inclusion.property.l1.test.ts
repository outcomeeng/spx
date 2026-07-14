import {
  assertMissingTrackedPathSetIncludesEveryPath,
  assertTrackedPathInclusionMatchesTrackedAncestors,
} from "@testing/harnesses/node-status/tracked-paths";
import { describe, it } from "vitest";

describe("createTrackedPathInclusion", () => {
  it("admits a path exactly when it is a tracked file or an ancestor directory of one", () => {
    assertTrackedPathInclusionMatchesTrackedAncestors();
  });

  it("admits every path when no tracked set is available", () => {
    assertMissingTrackedPathSetIncludesEveryPath();
  });
});
