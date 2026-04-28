import { describe, expect, it } from "vitest";

import { readSpecTree, SPEC_TREE_NODE_STATE } from "@/spec-tree";
import { KIND_REGISTRY } from "@/spec/config";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree";

describe("readSpecTree stable surface", () => {
  it("returns a snapshot with recognized entries, hierarchy, decisions, sorting, and derived states", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const root = snapshot.allNodes.find((node) => node.id === fixture.root.id);
    const child = snapshot.allNodes.find((node) => node.id === fixture.child.id);
    const peer = snapshot.allNodes.find((node) => node.id === fixture.peer.id);
    const expectedRoots = [fixture.root, fixture.peer].sort((left, right) => left.order - right.order);

    expect(snapshot.product?.id).toBe(fixture.product.id);
    expect(snapshot.nodes.map((node) => node.id)).toEqual(expectedRoots.map((node) => node.id));
    expect(snapshot.allNodes.map((node) => node.id)).toEqual([
      fixture.root.id,
      fixture.child.id,
      fixture.peer.id,
    ]);

    expect(root?.order).toBe(fixture.root.order);
    expect(peer?.order).toBe(fixture.peer.order);
    expect(root?.state).toBe(SPEC_TREE_NODE_STATE.DECLARED);
    expect(root?.children.map((node) => node.id)).toEqual([fixture.child.id]);
    expect(child?.state).toBe(SPEC_TREE_NODE_STATE.PASSING);
    expect(root?.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
    expect(peer?.state).toBe(SPEC_TREE_NODE_STATE.FAILING);
  });
});
