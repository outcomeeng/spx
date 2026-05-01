import { describe, expect, it } from "vitest";

import {
  readSpecTree,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeEvidenceStatus,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  buildEvidenceEntry,
  buildNodeEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

type StateCase = {
  readonly evidence?: SpecTreeEvidenceStatus;
  readonly expected: SpecTreeNodeState;
};

describe("node state derivation", () => {
  it("maps evidence status to node state", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const cases: readonly StateCase[] = [
      { expected: SPEC_TREE_NODE_STATE.DECLARED },
      { evidence: SPEC_TREE_EVIDENCE_STATUS.LINKED, expected: SPEC_TREE_NODE_STATE.SPECIFIED },
      { evidence: SPEC_TREE_EVIDENCE_STATUS.FAILING, expected: SPEC_TREE_NODE_STATE.FAILING },
      { evidence: SPEC_TREE_EVIDENCE_STATUS.PASSING, expected: SPEC_TREE_NODE_STATE.PASSING },
    ];

    for (const { evidence, expected } of cases) {
      const entries = [
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.root.id,
          order: fixture.root.order,
          slug: fixture.root.slug,
        }),
        ...(evidence === undefined
          ? []
          : [
            buildEvidenceEntry({
              id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
              parentId: fixture.root.id,
              status: evidence,
            }),
          ]),
      ];

      const snapshot = await readSpecTree({ source: createSource(entries) });

      expect(snapshot.nodes[0]?.state).toBe(expected);
    }
  });

  it("allows an injected evidence provider to own backend-specific state", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource([
        buildNodeEntry(KIND_REGISTRY, {
          id: fixture.root.id,
          order: fixture.root.order,
          slug: fixture.root.slug,
        }),
      ]),
      evidence: {
        stateForNode() {
          return SPEC_TREE_NODE_STATE.PASSING;
        },
      },
    });

    expect(snapshot.nodes[0]?.state).toBe(SPEC_TREE_NODE_STATE.PASSING);
  });
});
