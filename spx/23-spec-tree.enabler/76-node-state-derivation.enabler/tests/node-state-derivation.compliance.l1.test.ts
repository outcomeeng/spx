import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { providerOverrideCases } from "@testing/generators/spec-tree/node-state-derivation";
import { createSource } from "@testing/generators/spec-tree/spec-tree";

describe("injected evidence provider", () => {
  it.each(providerOverrideCases())("overrides the derived state: $label", async (testCase) => {
    const snapshot = await readSpecTree({
      source: createSource(testCase.entries),
      evidence: {
        stateForNode() {
          return testCase.providerState;
        },
      },
    });

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0].state).toBe(testCase.providerState);
  });
});
