import { describe, it } from "vitest";

import {
  assertFilesystemAndMemorySourcesProjectEquivalently,
  assertFilesystemSourceDescendsThroughDecisionShapedDirectories,
  assertFilesystemSourceMapsEvidenceRecords,
  assertFilesystemSourceRejectsDescendantsBelowUnregisteredDirectory,
  assertFilesystemSourceUsesProductRelativeRefsAndInclusion,
} from "@testing/harnesses/spec-tree/spec-tree-source";

describe("SpecTreeSource mappings", () => {
  it(
    "maps filesystem and memory records to equivalent projections",
    assertFilesystemAndMemorySourcesProjectEquivalently,
  );
  it(
    "uses product-root-relative refs and an inclusion predicate",
    assertFilesystemSourceUsesProductRelativeRefsAndInclusion,
  );
  it("maps co-located test files to linked evidence records", assertFilesystemSourceMapsEvidenceRecords);
  it(
    "descends through directories whose names match decision grammar",
    assertFilesystemSourceDescendsThroughDecisionShapedDirectories,
  );
  it(
    "rejects registered descendants below unregistered ordered directories",
    assertFilesystemSourceRejectsDescendantsBelowUnregisteredDirectory,
  );
});
