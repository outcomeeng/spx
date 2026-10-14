import { describe, expect, it } from "vitest";

import { findNextSpecTreeNode, KIND_REGISTRY, readSpecTree, SPEC_TREE_EVIDENCE_STATUS } from "@/lib/spec-tree";
import { buildEvidenceEntry, buildTraversalFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

describe("spec-tree traversal", () => {
  it("returns the first non-passing node in tree order, ahead of a later non-passing peer", async () => {
    const tree = buildTraversalFixture(KIND_REGISTRY);
    // Preorder is root, child, grandchild, peer: the nested grandchild precedes the peer, so a
    // breadth-first, reverse, or last-match walk reaches the peer instead.
    const snapshot = await readSpecTree({
      source: createSource([
        tree.root,
        tree.child,
        tree.grandchild,
        tree.peer,
        buildEvidenceEntry({
          id: tree.evidenceIds.root,
          parentId: tree.root.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
        buildEvidenceEntry({
          id: tree.evidenceIds.child,
          parentId: tree.child.id,
          status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
        }),
        buildEvidenceEntry({
          id: tree.evidenceIds.grandchild,
          parentId: tree.grandchild.id,
          status: SPEC_TREE_EVIDENCE_STATUS.FAILING,
        }),
        buildEvidenceEntry({
          id: tree.evidenceIds.peer,
          parentId: tree.peer.id,
          status: SPEC_TREE_EVIDENCE_STATUS.FAILING,
        }),
      ]),
    });

    expect(findNextSpecTreeNode(snapshot)?.id).toBe(tree.grandchild.id);
  });

  it("returns no node when every node is passing", async () => {
    const tree = buildTraversalFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource([
        tree.root,
        tree.child,
        tree.grandchild,
        tree.peer,
        ...[
          [tree.evidenceIds.root, tree.root.id],
          [tree.evidenceIds.child, tree.child.id],
          [tree.evidenceIds.grandchild, tree.grandchild.id],
          [tree.evidenceIds.peer, tree.peer.id],
        ].map(([id, parentId]) => buildEvidenceEntry({ id, parentId, status: SPEC_TREE_EVIDENCE_STATUS.PASSING })),
      ]),
    });

    expect(findNextSpecTreeNode(snapshot)).toBeNull();
  });
});
