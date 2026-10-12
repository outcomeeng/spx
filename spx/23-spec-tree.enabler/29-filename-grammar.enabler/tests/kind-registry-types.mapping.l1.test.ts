import { describe, expect, it } from "vitest";

import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, OUTPUT_KINDS, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree";
import { declaredKindCategoryCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry runtime key set and kind partition", () => {
  it("enumerates exactly the kinds the grammar declares", () => {
    expect(new Set(Object.keys(KIND_REGISTRY))).toEqual(new Set(declaredKindCategoryCases().map(({ kind }) => kind)));
  });

  it.each(declaredKindCategoryCases())(
    "registers $kind in the $category category and exports it through that category's kinds alone",
    ({ kind, category }) => {
      expect(KIND_REGISTRY[kind].category).toBe(category);
      expect(NODE_KINDS.some((exported) => exported === kind)).toBe(category === SPEC_TREE_KIND_CATEGORY.NODE);
      expect(OUTPUT_KINDS.some((exported) => exported === kind)).toBe(category === SPEC_TREE_KIND_CATEGORY.OUTPUT);
      expect(DECISION_KINDS.some((exported) => exported === kind)).toBe(
        category === SPEC_TREE_KIND_CATEGORY.DECISION,
      );
    },
  );

  it("partitions the declared kinds into the node, output, and decision kinds with no overlap", () => {
    const partitioned = [...NODE_KINDS, ...OUTPUT_KINDS, ...DECISION_KINDS];

    expect(partitioned).toHaveLength(declaredKindCategoryCases().length);
    expect(new Set(partitioned)).toEqual(new Set(declaredKindCategoryCases().map(({ kind }) => kind)));
  });
});
