import type { SpecTreeNode, SpecTreeProduct, SpecTreeSnapshot } from "./index";

export const SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND = {
  RESOLVED: "resolved",
  UNRESOLVED: "unresolved",
} as const;

export type SpecTreePathOwnershipResultKind =
  (typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND)[keyof typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND];

export type SpecTreePathOwnershipResolved = {
  readonly kind: typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED;
  readonly path: string;
  readonly candidates: readonly SpecTreeNode[];
  readonly governingOwner: SpecTreeProduct | SpecTreeNode;
};

export type SpecTreePathOwnershipUnresolved = {
  readonly kind: typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED;
  readonly path: string;
  readonly candidates: readonly [];
};

export type SpecTreePathOwnershipResult =
  | SpecTreePathOwnershipResolved
  | SpecTreePathOwnershipUnresolved;

export function resolveSpecTreePathOwnership(
  snapshot: SpecTreeSnapshot,
  productPath: string,
  claimedNodeIds: readonly string[],
): SpecTreePathOwnershipResult {
  const claimed = new Set(claimedNodeIds);
  const candidates = snapshot.allNodes.filter((node) => claimed.has(node.id));
  if (candidates.length === 0) {
    return {
      kind: SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED,
      path: productPath,
      candidates: [],
    };
  }

  const governingNode = lowestCommonNode(candidates, snapshot.allNodes);
  if (governingNode !== null) {
    return {
      kind: SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED,
      path: productPath,
      candidates,
      governingOwner: governingNode,
    };
  }
  if (snapshot.product === null) {
    throw new Error(`Cannot resolve governing owner for ${productPath}: snapshot has no product`);
  }
  return {
    kind: SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED,
    path: productPath,
    candidates,
    governingOwner: snapshot.product,
  };
}

function lowestCommonNode(
  candidates: readonly SpecTreeNode[],
  allNodes: readonly SpecTreeNode[],
): SpecTreeNode | null {
  const nodesById = new Map(allNodes.map((node) => [node.id, node]));
  const [first, ...remaining] = candidates;
  const remainingAncestors = remaining.map((node) => new Set(ancestorChain(node, nodesById).map(({ id }) => id)));
  return ancestorChain(first, nodesById).find((node) => remainingAncestors.every((ancestors) => ancestors.has(node.id)))
    ?? null;
}

function ancestorChain(
  node: SpecTreeNode,
  nodesById: ReadonlyMap<string, SpecTreeNode>,
): readonly SpecTreeNode[] {
  const ancestors: SpecTreeNode[] = [];
  let current: SpecTreeNode | undefined = node;
  while (current !== undefined) {
    ancestors.push(current);
    current = current.parentId === undefined ? undefined : nodesById.get(current.parentId);
  }
  return ancestors;
}
