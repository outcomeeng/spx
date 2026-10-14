import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, readSpecTree } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { createSource, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

// Index segments compare numerically segment by segment, a prefix before its extensions.
function precedes(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

describe("spec-tree assembly invariants", () => {
  it("orders siblings by index, keeps same-index siblings independent, and gives every child exactly one parent", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.assemblyScenario(KIND_REGISTRY),
      async (scenario) => {
        const snapshot = await readSpecTree({ source: createSource(scenario.entries) });

        for (const id of [...scenario.topLevelIds, ...scenario.childIds]) {
          expect(snapshot.allNodes.filter((node) => node.id === id)).toHaveLength(1);
        }

        // Every child keeps exactly one parent: the parent that lists it, and no other node does.
        for (const childId of scenario.childIds) {
          const parents = snapshot.allNodes.filter((node) => node.children.some((child) => child.id === childId));
          expect(parents.map((node) => node.id)).toEqual([scenario.parentId]);
          expect(snapshot.nodes.map((node) => node.id)).not.toContain(childId);
        }
        const parent = snapshot.allNodes.find((node) => node.id === scenario.parentId);
        expect(parent?.children.map((child) => child.id).sort(compareAsciiStrings)).toEqual(
          [...scenario.childIds].sort(compareAsciiStrings),
        );

        // Lower-index siblings precede higher-index siblings, among top-level nodes and among children.
        for (const siblings of [snapshot.nodes, parent?.children ?? []]) {
          for (const [position, earlier] of siblings.entries()) {
            for (const later of siblings.slice(position + 1)) {
              expect(precedes(earlier.orderSegments, later.orderSegments)).toBeLessThanOrEqual(0);
            }
          }
        }

        // Same-index siblings remain independent: neither lists the other, and all stay in the snapshot.
        expect(snapshot.nodes.map((node) => node.id).sort(compareAsciiStrings)).toEqual(
          [...scenario.topLevelIds].sort(compareAsciiStrings),
        );
        for (const node of snapshot.nodes) {
          for (const sibling of snapshot.nodes) {
            if (sibling.id === node.id) continue;
            expect(node.children.map((child) => child.id)).not.toContain(sibling.id);
            expect(node.parentId).toBeUndefined();
          }
        }
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
