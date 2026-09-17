import { describe, expect, it } from "vitest";

import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { representativeSpecTreeSurfaceFixture } from "@testing/generators/spec-tree/spec-tree";
import { observeRepresentativeSpecTreeSurfaceScenario } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree stable surface", () => {
  it("reads, projects, and selects the next root by tree order from a representative tree", async () => {
    await observeRepresentativeSpecTreeSurfaceScenario(representativeSpecTreeSurfaceFixture()).then((observation) => {
      expect(observation.snapshot.product?.id).toBe(observation.fixture.product.id);
      expect(observation.snapshot.nodes.map(({ id }) => id)).toEqual([
        observation.fixture.root.id,
        observation.fixture.peer.id,
      ]);
      expect(observation.snapshot.allNodes.map(({ id }) => id)).toEqual([
        observation.fixture.root.id,
        observation.fixture.child.id,
        observation.fixture.peer.id,
      ]);
      expect(observation.snapshot.allNodes.find(({ id }) => id === observation.fixture.root.id)?.children).toEqual([
        expect.objectContaining({ id: observation.fixture.child.id }),
      ]);
      expect(observation.snapshot.allNodes.find(({ id }) => id === observation.fixture.root.id)?.decisions).toEqual([
        expect.objectContaining({ id: observation.fixture.decision.id }),
      ]);
      expect(observation.snapshot.allNodes.find(({ id }) => id === observation.fixture.root.id)?.state).toBe(
        SPEC_TREE_NODE_STATE.DECLARED,
      );
      expect(observation.snapshot.allNodes.find(({ id }) => id === observation.fixture.child.id)?.state).toBe(
        SPEC_TREE_NODE_STATE.PASSING,
      );
      expect(observation.snapshot.allNodes.find(({ id }) => id === observation.fixture.peer.id)?.state).toBe(
        SPEC_TREE_NODE_STATE.FAILING,
      );
      expect(observation.projection.product?.id).toBe(observation.fixture.product.id);
      expect(observation.projection.nodes.map(({ id }) => id)).toEqual([
        observation.fixture.root.id,
        observation.fixture.peer.id,
      ]);
      expect(observation.projection.decisions.map(({ id }) => id)).toEqual([observation.fixture.decision.id]);
      expect(observation.nextNodeId).toBe(observation.fixture.root.id);
    });
  });
});
