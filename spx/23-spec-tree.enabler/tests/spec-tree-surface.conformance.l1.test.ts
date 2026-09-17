import { describe, expect, it } from "vitest";

import { observePublicSpecTreeSurfaceContract } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree public TypeScript surface", () => {
  it("exports the declared source contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import type { SpecTreeSource } from \"@/lib/spec-tree\"; declare const value: SpecTreeSource; void value;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared options contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import type { SpecTreeOptions } from \"@/lib/spec-tree\"; declare const value: SpecTreeOptions; void value;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared snapshot contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import type { SpecTreeSnapshot } from \"@/lib/spec-tree\"; declare const value: SpecTreeSnapshot; void value;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared node contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import type { SpecTreeNode } from \"@/lib/spec-tree\"; declare const value: SpecTreeNode; void value;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared read operation", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { readSpecTree } from \"@/lib/spec-tree\"; void readSpecTree;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared projection contract and operation", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { projectSpecTree, type SpecTreeProjection } from \"@/lib/spec-tree\"; declare const value: SpecTreeProjection; void projectSpecTree; void value;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared next-node operation", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { findNextSpecTreeNode } from \"@/lib/spec-tree\"; void findNextSpecTreeNode;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared registry contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { KIND_REGISTRY } from \"@/lib/spec-tree\"; void KIND_REGISTRY;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared grammar contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { SPEC_TREE_GRAMMAR } from \"@/lib/spec-tree\"; void SPEC_TREE_GRAMMAR;",
      ).diagnostics,
    ).toEqual([]);
  });

  it("exports the declared ownership operation and result contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(
        "import { resolveSpecTreePathOwnership, type SpecTreePathOwnershipResult } from \"@/lib/spec-tree\"; declare const value: SpecTreePathOwnershipResult; void resolveSpecTreePathOwnership; void value;",
      ).diagnostics,
    ).toEqual([]);
  });
});
