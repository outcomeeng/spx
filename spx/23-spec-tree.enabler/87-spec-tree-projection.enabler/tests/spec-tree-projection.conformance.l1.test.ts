import { describe, expect, it } from "vitest";

import * as fc from "fast-check";

import {
  compareSpecTreeOrder,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_PROJECTION,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  buildRepresentativeFixture,
  createSource,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

describe("spec-tree projection contract", () => {
  it("conforms to the stable projection shape consumed by commands and automation", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const projection = projectSpecTree(snapshot);
    const root = projection.nodes.find((node) => node.id === fixture.root.id);
    const decision = projection.decisions.find((entry) => entry.id === fixture.decision.id);
    const product = projection.product;

    expect(root).toBeDefined();
    expect(decision).toBeDefined();
    expect(product).not.toBeNull();
    if (root === undefined || decision === undefined || product === null) return;

    expect(Object.keys(projection).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.KEYS).sort(compareAsciiStrings),
    );
    expect(Object.keys(root).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.NODE_KEYS).sort(compareAsciiStrings),
    );
    expect(Object.keys(decision).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.DECISION_KEYS).sort(compareAsciiStrings),
    );
    expect(projection.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(product.id).toBe(fixture.product.id);
    expect(root.id).toBe(fixture.root.id);
    expect(decision.id).toBe(fixture.decision.id);
  });

  it("projects multi-segment indices in the order compareSpecTreeOrder places them, with no two indices sharing an order", async () => {
    // Segments of differing digit counts and equal-valued fractions: a decimal collapse reverses
    // [20,2] against [20,10] and collides [20,5] with [20,50].
    const orders: readonly (readonly number[])[] = [[20, 10], [20, 2], [20, 50], [20, 5], [20, 9], [3], [100]];
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const ids = sampleSpecTreeTestValue(
      fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceId(), {
        minLength: orders.length + 1,
        maxLength: orders.length + 1,
      }),
    );
    const slugs = sampleSpecTreeTestValue(
      fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceSlug(), {
        minLength: orders.length,
        maxLength: orders.length,
      }),
    );
    const [productId, ...nodeIds] = ids;
    const entries: readonly SpecTreeSourceEntry[] = [
      { type: SPEC_TREE_ENTRY_TYPE.PRODUCT, id: productId, title: productId },
      ...orders.map((orderSegments, index): SpecTreeSourceEntry => ({
        type: SPEC_TREE_ENTRY_TYPE.NODE,
        kind: nodeKind,
        id: nodeIds[index],
        orderSegments,
        slug: slugs[index],
      })),
    ];

    const projection = projectSpecTree(await readSpecTree({ source: createSource(entries) }));

    const bySegments = (left: readonly number[], right: readonly number[]) => compareSpecTreeOrder(left, right);
    const projected = [...projection.nodes].sort((left, right) => bySegments(left.order, right.order));
    expect(projected.map((node) => node.order)).toEqual([...orders].sort(bySegments));
    expect(new Set(projection.nodes.map((node) => node.order.join("."))).size).toBe(orders.length);
    expect(projection.nodes.map((node) => node.order)).toEqual(
      projection.nodes.map((node) => orders[nodeIds.indexOf(node.id)]),
    );
  });
});
