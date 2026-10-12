import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, readSpecTree } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  buildNodeEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec-tree assembly invariants", () => {
  it("preserves ordering and assigns every child exactly one parent", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);

    await fc.assert(
      fc.asyncProperty(
        SPEC_TREE_TEST_GENERATOR.assemblyNodeOrderSegments(),
        async ({ rootOrderSegments, childOrderSegments, peerOrderSegments }) => {
          const snapshot = await readSpecTree({
            source: createSource([
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.root.id,
                orderSegments: rootOrderSegments,
                slug: fixture.root.slug,
              }),
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.child.id,
                orderSegments: childOrderSegments,
                slug: fixture.child.slug,
                parentId: fixture.root.id,
              }),
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.peer.id,
                orderSegments: peerOrderSegments,
                slug: fixture.peer.slug,
              }),
            ]),
          });

          const root = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.root.id));
          expect(root.children.map((child) => child.id)).toEqual([fixture.child.id]);
          expect(snapshot.allNodes.filter((node) => node.id === fixture.child.id)).toHaveLength(1);
          // Sorted siblings: segment arrays compared numerically segment by segment, a prefix before its extensions.
          const precedes = (left: readonly number[], right: readonly number[]): number => {
            for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
              if (left[index] !== right[index]) return left[index] - right[index];
            }
            return left.length - right.length;
          };
          expect(snapshot.nodes.map((node) => node.orderSegments)).toEqual(
            [...snapshot.nodes].map((node) => node.orderSegments).sort(precedes),
          );
          expect(root.children.map((child) => child.orderSegments)).toEqual(
            [...root.children].map((child) => child.orderSegments).sort(precedes),
          );
        },
      ),
      { numRuns: SPEC_TREE_TEST_GENERATOR.counts.assemblyPropertyRunCount },
    );
  });

  it("keeps same-index siblings independent", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const orderSegments = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceOrderSegments());
    const snapshot = await readSpecTree({
      source: createSource([
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.root.id,
          orderSegments,
          slug: fixture.root.slug,
        }),
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.peer.id,
          orderSegments,
          slug: fixture.peer.slug,
        }),
      ]),
    });

    expect(snapshot.nodes.map((node) => node.id).sort(compareAsciiStrings)).toEqual(
      [fixture.peer.id, fixture.root.id].sort(compareAsciiStrings),
    );
    expect(snapshot.nodes.flatMap((node) => node.children)).toHaveLength(0);
  });
});
