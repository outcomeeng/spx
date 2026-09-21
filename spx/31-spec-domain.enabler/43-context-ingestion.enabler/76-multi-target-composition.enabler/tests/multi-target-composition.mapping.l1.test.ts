import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_MODE, type SpecContextProjectedEntry, suppressLoadedSpecContext } from "@/lib/spec-tree";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

function projected(
  path: string,
  mode: (typeof SPEC_CONTEXT_MODE)[keyof typeof SPEC_CONTEXT_MODE],
): SpecContextProjectedEntry {
  return {
    selection: { path, mode },
    entry: mode === SPEC_CONTEXT_MODE.REFERENCE
      ? { type: "reference", path }
      : { type: "document", path, metadata: {}, content: path },
  };
}

describe("spec context suppression precedence", () => {
  it("maps every prior and requested mode pair to suppression exactly when the prior mode is at least the requested one", () => {
    const modes = Object.values(SPEC_CONTEXT_MODE);
    const path = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    for (const prior of modes) {
      for (const requested of modes) {
        const remaining = suppressLoadedSpecContext([projected(path, requested)], [projected(path, prior)]);
        // Full satisfies Full or Digest; Digest satisfies only Digest or a
        // reference; the numeric mode order is the source-owned law.
        expect(remaining.length, `prior ${prior} requested ${requested}`).toBe(prior >= requested ? 0 : 1);
      }
    }
  });

  it("maps an entry no loaded projection covers to itself and merges several loaded projections by their highest mode", () => {
    const covered = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const uncovered = `${covered}-other`;
    const remaining = suppressLoadedSpecContext(
      [projected(covered, SPEC_CONTEXT_MODE.FULL), projected(uncovered, SPEC_CONTEXT_MODE.DIGEST)],
      [projected(covered, SPEC_CONTEXT_MODE.DIGEST), projected(covered, SPEC_CONTEXT_MODE.FULL)],
    );
    expect(remaining.map((entry) => entry.path)).toEqual([uncovered]);
  });
});
