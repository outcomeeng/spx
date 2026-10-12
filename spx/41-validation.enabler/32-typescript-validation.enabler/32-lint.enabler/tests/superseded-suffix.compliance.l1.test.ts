import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { orderedDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import { observeLintPolicyOfProduct } from "@testing/harnesses/validation/lint-policy";

describe("lint policy rejects a spec node directory only when no selected naming-schema version accepts its suffix", () => {
  it("accepts a .capability directory under a 4.0 declaration", async () => {
    const result = await observeLintPolicyOfProduct({
      declaredLine: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
      nodeDirectories: [orderedDirectoryName(KIND_REGISTRY.capability.suffix)],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a .capability directory under a 3.2 declaration, naming the directory", async () => {
    const directory = orderedDirectoryName(KIND_REGISTRY.capability.suffix);

    const result = await observeLintPolicyOfProduct({
      declaredLine: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
      nodeDirectories: [directory],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(directory);
    }
  });

  it("accepts an .enabler directory under a 3.2 declaration", async () => {
    const result = await observeLintPolicyOfProduct({
      declaredLine: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
      nodeDirectories: [orderedDirectoryName(KIND_REGISTRY.enabler.suffix)],
    });

    expect(result.ok).toBe(true);
  });
});
