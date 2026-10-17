import { describe, expect, it } from "vitest";

import { DECISION_KINDS, type Kind, KIND_REGISTRY, NODE_KINDS, OUTPUT_KINDS } from "@/lib/spec-tree";

describe("kind registry runtime key set and kind partition", () => {
  const registeredKinds = Object.keys(KIND_REGISTRY) as Kind[];

  it.each(registeredKinds)("lists %s in exactly one of the node, output, and decision kinds", (kind) => {
    const memberships = [NODE_KINDS, OUTPUT_KINDS, DECISION_KINDS].filter((kinds) =>
      kinds.some((exported) => exported === kind)
    );

    expect(memberships).toHaveLength(1);
  });

  it("partitions the registered kinds into the node, output, and decision kinds with no overlap", () => {
    const partitioned = [...NODE_KINDS, ...OUTPUT_KINDS, ...DECISION_KINDS];

    expect(partitioned).toHaveLength(registeredKinds.length);
    expect(new Set(partitioned)).toEqual(new Set(registeredKinds));
  });
});
