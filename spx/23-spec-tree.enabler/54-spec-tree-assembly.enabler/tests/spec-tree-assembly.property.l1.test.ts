import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  buildNodeEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

const ORDER_COUNT = 3;
const PROPERTY_RUNS = 25;

describe("spec-tree assembly invariants", () => {
  it("preserves ordering and assigns every child exactly one parent", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceOrder(), {
          minLength: ORDER_COUNT,
          maxLength: ORDER_COUNT,
        }),
        async ([rootOrder, childOrder, peerOrder]) => {
          const snapshot = await readSpecTree({
            source: createSource([
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.root.id,
                order: rootOrder,
                slug: fixture.root.slug,
              }),
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.child.id,
                order: childOrder,
                slug: fixture.child.slug,
                parentId: fixture.root.id,
              }),
              buildNodeEntry(KIND_REGISTRY, {
                id: fixture.peer.id,
                order: peerOrder,
                slug: fixture.peer.slug,
              }),
            ]),
          });

          const root = snapshot.allNodes.find((node) => node.id === fixture.root.id);
          expect(root?.children.map((child) => child.id)).toEqual([fixture.child.id]);
          expect(snapshot.allNodes.filter((node) => node.id === fixture.child.id)).toHaveLength(1);
          expect(snapshot.nodes.map((node) => node.order)).toEqual(
            [...snapshot.nodes].map((node) => node.order).sort((left, right) => left - right),
          );
          expect(root?.children.map((child) => child.order)).toEqual(
            [...(root?.children ?? [])].map((child) => child.order).sort((left, right) => left - right),
          );
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });

  it("keeps same-index siblings independent", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const order = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceOrder());
    const snapshot = await readSpecTree({
      source: createSource([
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.root.id,
          order,
          slug: fixture.root.slug,
        }),
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.peer.id,
          order,
          slug: fixture.peer.slug,
        }),
      ]),
    });

    expect(snapshot.nodes.map((node) => node.id).sort()).toEqual([fixture.peer.id, fixture.root.id].sort());
    expect(snapshot.nodes.flatMap((node) => node.children)).toHaveLength(0);
  });
});
