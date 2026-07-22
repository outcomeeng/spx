/**
 * Pure structural selection for one context target over a parsed spec-tree
 * snapshot: ancestors, siblings by index relation, applicable decisions, and
 * co-located evidence entries. Every function is a pure function over the
 * supplied snapshot; filesystem and git reads stay in the command handler.
 *
 * @module lib/spec-tree/context-read-set
 */

import { SPEC_TREE_ENTRY_TYPE } from "./config";
import { compareSpecContextOrdinal, SPEC_CONTEXT_LISTED_ROLE, SPEC_CONTEXT_READ_ROLE } from "./context-manifest";
import type {
  SpecContextTargetListedEntry,
  SpecContextTargetReadDocument,
  SpecContextTargetReadSet,
} from "./context-manifest";
import type { SpecTreeDecision, SpecTreeEvidenceSourceEntry, SpecTreeNode, SpecTreeSnapshot } from "./index";

/** The target's ancestor chain from the product root downward, excluding the target itself. */
export function specContextAncestors(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  const byId = new Map(snapshot.allNodes.map((node) => [node.id, node]));
  const ancestors: SpecTreeNode[] = [];
  let currentParent = target.parentId;
  while (currentParent !== undefined) {
    const parent = byId.get(currentParent);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    currentParent = parent.parentId;
  }
  return ancestors;
}

/** Every sibling sharing the target's parent, excluding the target itself. */
export function specContextSiblings(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  return snapshot.allNodes
    .filter((node) => node.parentId === target.parentId && node.id !== target.id);
}

/**
 * Lower-index siblings of every node along the context path, each appearing
 * once, ordered by parent identity, sibling order, then node identity.
 */
export function specContextLowerIndexSiblings(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeNode[] {
  const seen = new Set<string>();
  const lowerSiblings: SpecTreeNode[] = [];
  for (const contextNode of contextNodes) {
    for (const sibling of specContextSiblings(snapshot, contextNode)) {
      if (sibling.order >= contextNode.order || seen.has(sibling.id)) continue;
      lowerSiblings.push(sibling);
      seen.add(sibling.id);
    }
  }
  lowerSiblings.sort((left, right) => {
    const parentComparison = compareSpecContextOrdinal(left.parentId ?? "", right.parentId ?? "");
    if (parentComparison !== 0) return parentComparison;
    const orderComparison = left.order - right.order;
    if (orderComparison !== 0) return orderComparison;
    return compareSpecContextOrdinal(left.id, right.id);
  });
  return lowerSiblings;
}

/**
 * Decisions constraining the context path: every decision inside the target,
 * plus each directory's decisions below that directory's constraining order.
 */
export function specContextDecisions(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeDecision[] {
  const constrainingOrderByParentId = new Map(
    contextNodes.map((node) => [node.parentId, node.order] as const),
  );
  const targetId = contextNodes.at(-1)?.id;
  return snapshot.decisions.filter((decision) => {
    if (decision.parentId === targetId) return true;
    const constrainingOrder = constrainingOrderByParentId.get(decision.parentId);
    return constrainingOrder !== undefined && decision.order < constrainingOrder;
  });
}

/**
 * Existence-verified candidate paths for one context target, grouped by
 * manifest role. Each group preserves the caller's walk order; assembly fixes
 * only the order between groups. Cited-decision entries arrive as complete
 * documents because they already carry citing-file provenance.
 */
export interface SpecContextReadSetCandidates {
  readonly product: readonly string[];
  readonly ancestors: readonly string[];
  readonly target: readonly string[];
  readonly decisions: readonly string[];
  readonly lowerIndexSiblings: readonly string[];
  readonly coordination: readonly string[];
  readonly citedDecisions: readonly SpecContextTargetReadDocument[];
  readonly lifecycleOverlay: readonly string[];
  readonly evidence: readonly string[];
  readonly guides: readonly string[];
  readonly overlays: readonly string[];
  readonly sameIndexSiblings: readonly string[];
  readonly higherIndexSiblings: readonly string[];
}

/**
 * Read-order construction for one target: projects existence-verified
 * candidates into the read and listed sequences in the fixed role-group
 * order the manifest schema declares. Pure over its inputs; every filesystem
 * probe stays with the caller.
 */
export function assembleSpecContextTargetReadSet(
  targetPath: string,
  candidates: SpecContextReadSetCandidates,
): SpecContextTargetReadSet {
  const read: SpecContextTargetReadDocument[] = [
    ...candidates.product.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.PRODUCT, path })),
    ...candidates.ancestors.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.ANCESTOR, path })),
    ...candidates.target.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.TARGET, path })),
    ...candidates.decisions.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.DECISION, path })),
    ...candidates.lowerIndexSiblings.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING, path })),
    ...candidates.coordination.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.COORDINATION, path })),
    ...candidates.citedDecisions,
    ...candidates.lifecycleOverlay.map((path) => ({ role: SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY, path })),
  ];
  const listed: SpecContextTargetListedEntry[] = [
    ...candidates.evidence.map((path) => ({ role: SPEC_CONTEXT_LISTED_ROLE.EVIDENCE, path })),
    ...candidates.guides.map((path) => ({ role: SPEC_CONTEXT_LISTED_ROLE.GUIDE, path })),
    ...candidates.overlays.map((path) => ({ role: SPEC_CONTEXT_LISTED_ROLE.OVERLAY, path })),
    ...candidates.sameIndexSiblings.map((path) => ({ role: SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING, path })),
    ...candidates.higherIndexSiblings.map((path) => ({ role: SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING, path })),
  ];
  return { target: targetPath, read, listed };
}

/** The target's co-located evidence entries. */
export function specContextEvidence(
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
): readonly SpecTreeEvidenceSourceEntry[] {
  return snapshot.entries.filter(
    (entry): entry is SpecTreeEvidenceSourceEntry =>
      entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE && entry.parentId === target.id,
  );
}
