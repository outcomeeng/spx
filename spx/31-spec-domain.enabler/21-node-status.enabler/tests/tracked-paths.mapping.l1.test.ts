import {
  assertFailedTrackedPathListingReturnsUndefined,
  assertSuccessfulTrackedPathListing,
  assertUnavailableGitReturnsUndefined,
} from "@testing/harnesses/node-status/tracked-paths";
import { describe, it } from "vitest";

describe("listTrackedPaths", () => {
  it("maps a successful git ls-files run to the set of NUL-separated tracked paths", async () => {
    await assertSuccessfulTrackedPathListing();
  });

  it("maps a non-zero git ls-files exit (outside a git repository) to undefined", async () => {
    await assertFailedTrackedPathListingReturnsUndefined();
  });

  it("maps a git runner failure (git executable unavailable) to undefined", async () => {
    await assertUnavailableGitReturnsUndefined();
  });
});
