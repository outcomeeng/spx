import {
  findNextSpecTreeNode,
  KIND_REGISTRY,
  NODE_KINDS,
  projectSpecTree,
  readSpecTree,
  resolveSpecTreePathOwnership,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND,
  type SpecTreeNode,
  type SpecTreeOptions,
  type SpecTreePathOwnershipResult,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";

const source: SpecTreeSource = {
  async *entries(): AsyncIterable<SpecTreeSourceEntry> {
    yield {
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: SPEC_TREE_CONFIG.PRODUCT.SUFFIX,
      title: SPEC_TREE_CONFIG.PRODUCT.LABEL,
    };
    yield {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      kind: NODE_KINDS[0],
      id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${NODE_KINDS[0]}`,
      order: 1,
      slug: NODE_KINDS[0],
    };
  },
};

const options: SpecTreeOptions = { source, registry: KIND_REGISTRY };

export async function consumePublicSpecTreeSurface(): Promise<SpecTreeProjection> {
  const snapshot: SpecTreeSnapshot = await readSpecTree(options);
  const projection: SpecTreeProjection = projectSpecTree(snapshot);
  const next: SpecTreeNode | null = findNextSpecTreeNode(snapshot);
  const ownership: SpecTreePathOwnershipResult = resolveSpecTreePathOwnership(
    snapshot,
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    next === null ? [] : [next.id],
  );
  void next;
  if (ownership.kind === SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED) {
    void ownership.governingOwner;
  }
  return projection;
}
