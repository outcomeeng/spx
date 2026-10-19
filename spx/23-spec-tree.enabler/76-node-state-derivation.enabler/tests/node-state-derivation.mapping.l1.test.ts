import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { nodeStateCases } from "@testing/generators/spec-tree/node-state-derivation";
import { createSource } from "@testing/generators/spec-tree/spec-tree";

describe("node state derivation", () => {
  it.each(nodeStateCases())("maps $label to its node state", async (testCase) => {
    const snapshot = await readSpecTree({ source: createSource(testCase.entries) });

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0].state).toBe(testCase.expected);
  });
});
