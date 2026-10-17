import { describe, expect, it } from "vitest";

import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS, OUTPUT_KINDS } from "@/lib/spec-tree";
import { declaredKinds } from "@testing/generators/spec-tree/declared-kinds";
import { kindPartitionCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry runtime key set and kind partition", () => {
  it("enumerates exactly the kinds the grammar declares", () => {
    expect(new Set(Object.keys(KIND_REGISTRY))).toEqual(new Set(declaredKinds()));
  });

  it.each(kindPartitionCases())("exports $kind through the kinds of its declared category alone", (testCase) => {
    expect(NODE_KINDS.some((exported) => exported === testCase.kind)).toBe(testCase.inNodeKinds);
    expect(OUTPUT_KINDS.some((exported) => exported === testCase.kind)).toBe(testCase.inOutputKinds);
    expect(DECISION_KINDS.some((exported) => exported === testCase.kind)).toBe(testCase.inDecisionKinds);
  });

  it("partitions the declared kinds into the node, output, and decision kinds with no overlap", () => {
    const partitioned = [...NODE_KINDS, ...OUTPUT_KINDS, ...DECISION_KINDS];

    expect(partitioned).toHaveLength(declaredKinds().length);
    expect(new Set(partitioned)).toEqual(new Set(declaredKinds()));
  });
});
