import { describe, expect, it } from "vitest";

import { findNextSpecTreeNode, KIND_REGISTRY, readSpecTree, SPEC_TREE_EVIDENCE_STATUS } from "@/lib/spec-tree";
import {
  buildEvidenceEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec-tree traversal", () => {
  it("returns the first non-passing node in deterministic tree order", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource([
        fixture.product,
        fixture.root,
        fixture.child,
        fixture.peer,
        buildEvidenceEntry({
          id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
          parentId: fixture.root.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
        buildEvidenceEntry({
          id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
          parentId: fixture.child.id,
          status: SPEC_TREE_EVIDENCE_STATUS.FAILING,
        }),
        buildEvidenceEntry({
          id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
          parentId: fixture.peer.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
      ]),
    });

    expect(expectPresent(findNextSpecTreeNode(snapshot)).id).toBe(fixture.child.id);
  });

  it("returns no node when every node is passing", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource([
        fixture.root,
        fixture.child,
        buildEvidenceEntry({
          id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
          parentId: fixture.root.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
        buildEvidenceEntry({
          id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
          parentId: fixture.child.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
      ]),
    });

    expect(findNextSpecTreeNode(snapshot)).toBeNull();
  });
});
