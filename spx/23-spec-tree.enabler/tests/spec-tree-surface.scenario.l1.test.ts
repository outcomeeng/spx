import { describe, expect, it } from "vitest";

import { findNextSpecTreeNode, projectSpecTree, readSpecTree, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

describe("spec-tree stable surface", () => {
  it("reads, projects, and selects the next node from a representative tree", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const root = expectDefined(snapshot.allNodes.find((node) => node.id === fixture.root.id));
    const child = expectDefined(snapshot.allNodes.find((node) => node.id === fixture.child.id));
    const peer = expectDefined(snapshot.allNodes.find((node) => node.id === fixture.peer.id));
    const expectedRoots = [fixture.root, fixture.peer].sort((left, right) => left.order - right.order);
    const snapshotProduct = expectDefined(snapshot.product);

    expect(snapshotProduct.id).toBe(fixture.product.id);
    expect(snapshot.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
    expect(snapshot.allNodes.map((node) => node.id)).toEqual([
      fixture.root.id,
      fixture.child.id,
      fixture.peer.id,
    ]);

    expect(root.order).toBe(fixture.root.order);
    expect(peer.order).toBe(fixture.peer.order);
    expect(root.state).toBe(SPEC_TREE_NODE_STATE.DECLARED);
    expect(root.children.map((node) => node.id)).toEqual([fixture.child.id]);
    expect(child.state).toBe(SPEC_TREE_NODE_STATE.PASSING);
    expect(root.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
    expect(peer.state).toBe(SPEC_TREE_NODE_STATE.FAILING);

    const projection = projectSpecTree(snapshot);
    const projectionProduct = expectDefined(projection.product);
    const nextNode = expectDefined(findNextSpecTreeNode(snapshot));

    expect(projectionProduct.id).toBe(fixture.product.id);
    expect(projection.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
    expect(projection.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
    expect(nextNode.id).toBe(fixture.root.id);
  });
});

function expectDefined<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) {
    throw new Error("Expected spec-tree surface value to be defined");
  }
  return value;
}
