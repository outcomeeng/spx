import { describe, expect, it } from "vitest";

import { arbitraryOrderedIndexScenario } from "@testing/generators/spec-tree/projection-contract";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { observeProjection } from "@testing/harnesses/spec-tree/projection-contract";

// Reads two projected orders as the spec states: segment by segment, the first differing segment
// decides, and an order that is a prefix of the other comes first.
function precedes(left: readonly number[], right: readonly number[]): boolean {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return left.length < right.length;
}

describe("spec-tree projection order", () => {
  it(
    "projects each node and decision index as its numeric segments in sequence and keeps the dependency order",
    async () => {
      await assertProperty(
        arbitraryOrderedIndexScenario(),
        async (scenario) => {
          const projection = await observeProjection([...scenario.nodeEntries, ...scenario.decisionEntries]);

          for (const entry of [...scenario.nodeEntries, ...scenario.decisionEntries]) {
            const projected = [...projection.nodes, ...projection.decisions].find((item) => item.id === entry.id);
            expect(projected?.order).toEqual(entry.orderSegments);
          }

          expect(projection.nodes.map((node) => node.order)).toEqual(scenario.ordered);
          expect(projection.decisions.map((decision) => decision.order)).toEqual(scenario.ordered);

          for (const projected of [projection.nodes, projection.decisions]) {
            for (let position = 1; position < projected.length; position += 1) {
              expect(precedes(projected[position - 1].order, projected[position].order)).toBe(true);
            }
          }
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
