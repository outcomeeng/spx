import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  resolveSpecTreePathOwnership,
  SPEC_TREE_EVIDENCE_KEY_KIND,
  SPEC_TREE_EVIDENCE_TARGET,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_VERIFICATION_TYPE,
  type SpecTreeEvidenceKey,
  type SpecTreeEvidenceReference,
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
  const references: readonly SpecTreeEvidenceReference[] = snapshot.allNodes[0]?.evidenceReferences ?? [];
  const keys: readonly SpecTreeEvidenceKey[] = references.map(({ key }) => key);
  void keys;
  void SPEC_TREE_EVIDENCE_KEY_KIND;
  void SPEC_TREE_EVIDENCE_TARGET;
  void SPEC_TREE_VERIFICATION_TYPE;
  void next;
  void ownership;
  void SPEC_TREE_GRAMMAR;
  return projection;
}
