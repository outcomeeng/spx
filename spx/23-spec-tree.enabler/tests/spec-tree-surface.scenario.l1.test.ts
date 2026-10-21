import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryCoveringEvidenceReferenceScenario } from "@testing/generators/spec-tree/evidence-references";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { readEvidenceSpecsFromMemory } from "@testing/harnesses/spec-tree/evidence-references";
import { observeRepresentativeSpecTreeSurfaceScenario } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree stable surface", () => {
  it("reads, projects, and selects the next root by tree order from a representative tree", async () => {
    const generated = sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY));
    // The source yields its records in reverse tree order, so every sibling order the snapshot
    // reports is one the read established rather than one the input already carried.
    await observeRepresentativeSpecTreeSurfaceScenario({
      ...generated,
      entries: [...generated.entries].reverse(),
    }).then((observation) => {
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

  it("carries on each node the evidence references its spec declares", async () => {
    const scenario = sampleGeneratedValue(arbitraryCoveringEvidenceReferenceScenario());

    const snapshot = await readEvidenceSpecsFromMemory([scenario]);

    expect(snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences).toEqual(
      scenario.expected,
    );
  });
});
