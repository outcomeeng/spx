import { describe, expect, it } from "vitest";

import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec-tree stable surface", () => {
  it("reads, projects, and selects the next root by tree order from a representative tree", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const root = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.root.id));
    const child = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.child.id));
    const peer = expectPresent(snapshot.allNodes.find((node) => node.id === fixture.peer.id));
    const expectedRoots = [fixture.root, fixture.peer].sort((left, right) => left.order - right.order);
    const snapshotProduct = expectPresent(snapshot.product);

    expect(snapshotProduct.id).toBe(fixture.product.id);
    expect(snapshot.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
    expect(snapshot.allNodes.map((node) => node.id)).toEqual([
      fixture.root.id,
      fixture.child.id,
      fixture.peer.id,
    ]);

    expect(root.order).toBe(fixture.root.order);
    expect(peer.order).toBe(fixture.peer.order);
    expect(root.order).toBeLessThan(peer.order);
    expect(root.state).toBe(SPEC_TREE_NODE_STATE.DECLARED);
    expect(root.children.map((node) => node.id)).toEqual([fixture.child.id]);
    expect(child.state).toBe(SPEC_TREE_NODE_STATE.PASSING);
    expect(root.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
    expect(peer.state).toBe(SPEC_TREE_NODE_STATE.FAILING);

    const projection = projectSpecTree(snapshot);
    const projectionProduct = expectPresent(projection.product);
    const nextNode = expectPresent(findNextSpecTreeNode(snapshot));

    expect(projectionProduct.id).toBe(fixture.product.id);
    expect(projection.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
    expect(projection.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
    expect(nextNode.id).toBe(fixture.root.id);
  });
});
