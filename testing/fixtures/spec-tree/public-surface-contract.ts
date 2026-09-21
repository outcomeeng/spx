import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  resolveSpecTreePathOwnership,
  SPEC_TREE_GRAMMAR,
  type SpecTreeNode,
  type SpecTreeOptions,
  type SpecTreePathOwnershipResult,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
  type SpecTreeSource,
} from "@/lib/spec-tree";

declare const source: SpecTreeSource;
declare const snapshot: SpecTreeSnapshot;
declare const productPath: string;
declare const claimedNodeIds: readonly string[];

const options: SpecTreeOptions = { source, registry: KIND_REGISTRY };

/** Applies every exported operation with declared inputs and binds each result to its declared type. */
export async function consumePublicSpecTreeSurface(): Promise<SpecTreeProjection> {
  const read: SpecTreeSnapshot = await readSpecTree(options);
  const projection: SpecTreeProjection = projectSpecTree(read);
  const next: SpecTreeNode | null = findNextSpecTreeNode(read);
  const ownership: SpecTreePathOwnershipResult = resolveSpecTreePathOwnership(snapshot, productPath, claimedNodeIds);
  void next;
  void ownership;
  void SPEC_TREE_GRAMMAR;
  return projection;
}
