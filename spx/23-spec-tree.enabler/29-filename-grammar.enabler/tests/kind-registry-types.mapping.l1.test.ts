import { describe, expect, it } from "vitest";

import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, OUTPUT_KINDS, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree";
import { declaredKinds } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry runtime key set and kind partition", () => {
  it("enumerates exactly the kinds the grammar declares", () => {
    expect(new Set(Object.keys(KIND_REGISTRY))).toEqual(new Set(declaredKinds()));
  });

  it.each(declaredKinds())("exports %s through the kinds of its registered category alone", (kind) => {
    const category = KIND_REGISTRY[kind].category;

    expect(NODE_KINDS.some((exported) => exported === kind)).toBe(category === SPEC_TREE_KIND_CATEGORY.NODE);
    expect(OUTPUT_KINDS.some((exported) => exported === kind)).toBe(category === SPEC_TREE_KIND_CATEGORY.OUTPUT);
    expect(DECISION_KINDS.some((exported) => exported === kind)).toBe(category === SPEC_TREE_KIND_CATEGORY.DECISION);
  });

  it("partitions the declared kinds into the node, output, and decision kinds with no overlap", () => {
    const partitioned = [...NODE_KINDS, ...OUTPUT_KINDS, ...DECISION_KINDS];

    expect(partitioned).toHaveLength(declaredKinds().length);
    expect(new Set(partitioned)).toEqual(new Set(declaredKinds()));
  });
});
