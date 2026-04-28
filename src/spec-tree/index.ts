import type { DecisionKind, KindDefinition, NodeKind } from "@/spec/config";
import { KIND_REGISTRY, SPEC_TREE_KIND_CATEGORY } from "@/spec/config";

const SPEC_TREE_FIELD_KEY = {
  VERSION: "version",
  PRODUCT: "product",
  NODES: "nodes",
  DECISIONS: "decisions",
  TYPE: "type",
  KIND: "kind",
  CHILDREN: "children",
  ID: "id",
  ORDER: "order",
  SLUG: "slug",
  STATE: "state",
} as const;

export const SPEC_TREE_ENTRY_TYPE = {
  PRODUCT: SPEC_TREE_FIELD_KEY.PRODUCT,
  NODE: SPEC_TREE_KIND_CATEGORY.NODE,
  DECISION: SPEC_TREE_KIND_CATEGORY.DECISION,
  EVIDENCE: "evidence",
} as const;

export type SpecTreeEntryType = (typeof SPEC_TREE_ENTRY_TYPE)[keyof typeof SPEC_TREE_ENTRY_TYPE];

export const SPEC_TREE_NODE_STATE = {
  DECLARED: "declared",
  SPECIFIED: "specified",
  FAILING: "failing",
  PASSING: "passing",
} as const;

export type SpecTreeNodeState = (typeof SPEC_TREE_NODE_STATE)[keyof typeof SPEC_TREE_NODE_STATE];

export const SPEC_TREE_EVIDENCE_STATUS = {
  LINKED: "linked",
  FAILING: SPEC_TREE_NODE_STATE.FAILING,
  PASSING: SPEC_TREE_NODE_STATE.PASSING,
} as const;

export type SpecTreeEvidenceStatus = (typeof SPEC_TREE_EVIDENCE_STATUS)[keyof typeof SPEC_TREE_EVIDENCE_STATUS];

export const SPEC_TREE_PROJECTION = {
  VERSION: 1,
  KEYS: {
    VERSION: SPEC_TREE_FIELD_KEY.VERSION,
    PRODUCT: SPEC_TREE_FIELD_KEY.PRODUCT,
    NODES: SPEC_TREE_FIELD_KEY.NODES,
    DECISIONS: SPEC_TREE_FIELD_KEY.DECISIONS,
  },
  NODE_KEYS: {
    ID: SPEC_TREE_FIELD_KEY.ID,
    KIND: SPEC_TREE_FIELD_KEY.KIND,
    ORDER: SPEC_TREE_FIELD_KEY.ORDER,
    SLUG: SPEC_TREE_FIELD_KEY.SLUG,
    STATE: SPEC_TREE_FIELD_KEY.STATE,
    CHILDREN: SPEC_TREE_FIELD_KEY.CHILDREN,
  },
  DECISION_KEYS: {
    ID: SPEC_TREE_FIELD_KEY.ID,
    KIND: SPEC_TREE_FIELD_KEY.KIND,
    ORDER: SPEC_TREE_FIELD_KEY.ORDER,
    SLUG: SPEC_TREE_FIELD_KEY.SLUG,
  },
} as const;

export const SPEC_TREE_SOURCE_ENTRY_KEYS = {
  TYPE: SPEC_TREE_FIELD_KEY.TYPE,
  KIND: SPEC_TREE_FIELD_KEY.KIND,
} as const;

export type SpecTreeSourceEntryKey = (typeof SPEC_TREE_SOURCE_ENTRY_KEYS)[keyof typeof SPEC_TREE_SOURCE_ENTRY_KEYS];

export const SPEC_TREE_NODE_RELATION_KEYS = {
  CHILDREN: SPEC_TREE_FIELD_KEY.CHILDREN,
  DECISIONS: SPEC_TREE_FIELD_KEY.DECISIONS,
} as const;

type SpecTreeNodeRelationKey = (typeof SPEC_TREE_NODE_RELATION_KEYS)[keyof typeof SPEC_TREE_NODE_RELATION_KEYS];

export type SpecTreeRegistry = typeof KIND_REGISTRY;

export type SpecTreeSourceRef = {
  readonly id: string;
  readonly path?: string;
  readonly url?: string;
};

type SpecTreeSourceEntryBase = {
  readonly id: string;
  readonly ref?: SpecTreeSourceRef;
};

export type SpecTreeProductSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.PRODUCT;
  readonly title: string;
};

export type SpecTreeNodeSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.NODE;
  readonly kind: NodeKind;
  readonly order: number;
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
};

export type SpecTreeDecisionSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.DECISION;
  readonly kind: DecisionKind;
  readonly order: number;
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
};

export type SpecTreeEvidenceSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.EVIDENCE;
  readonly parentId: string;
  readonly status: SpecTreeEvidenceStatus;
};

export type SpecTreeSourceEntry =
  | SpecTreeProductSourceEntry
  | SpecTreeNodeSourceEntry
  | SpecTreeDecisionSourceEntry
  | SpecTreeEvidenceSourceEntry;

export type SpecTreeSource = {
  entries(): AsyncIterable<SpecTreeSourceEntry>;
  readText?(ref: SpecTreeSourceRef): Promise<string>;
};

export type SpecTreeEvidenceProvider = {
  stateForNode?(
    node: SpecTreeNodeSourceEntry,
    evidence: readonly SpecTreeEvidenceSourceEntry[],
  ): SpecTreeNodeState | undefined;
};

export type SpecTreeOptions = {
  readonly source: SpecTreeSource;
  readonly registry?: SpecTreeRegistry;
  readonly evidence?: SpecTreeEvidenceProvider;
};

export type SpecTreeProduct = {
  readonly id: string;
  readonly title: string;
  readonly ref?: SpecTreeSourceRef;
};

export type SpecTreeDecision = {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly order: number;
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
  readonly ref?: SpecTreeSourceRef;
};

export type SpecTreeNode = {
  readonly id: string;
  readonly kind: NodeKind;
  readonly order: number;
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
  readonly ref?: SpecTreeSourceRef;
  readonly state: SpecTreeNodeState;
  readonly decisions: readonly SpecTreeDecision[];
  readonly children: readonly SpecTreeNode[];
};

export type SpecTreeSnapshot = {
  readonly product: SpecTreeProduct | null;
  readonly nodes: readonly SpecTreeNode[];
  readonly allNodes: readonly SpecTreeNode[];
  readonly decisions: readonly SpecTreeDecision[];
  readonly entries: readonly SpecTreeSourceEntry[];
};

export type SpecTreeProjectedNode = {
  readonly id: string;
  readonly kind: NodeKind;
  readonly order: number;
  readonly slug: string;
  readonly state: SpecTreeNodeState;
  readonly children: readonly SpecTreeProjectedNode[];
};

export type SpecTreeProjectedDecision = {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly order: number;
  readonly slug: string;
};

export type SpecTreeProjectedProduct = {
  readonly id: string;
  readonly title: string;
};

export type SpecTreeProjection = {
  readonly version: typeof SPEC_TREE_PROJECTION.VERSION;
  readonly product: SpecTreeProjectedProduct | null;
  readonly nodes: readonly SpecTreeProjectedNode[];
  readonly decisions: readonly SpecTreeProjectedDecision[];
};

type MutableSpecTreeNode = Omit<SpecTreeNode, SpecTreeNodeRelationKey> & {
  readonly children: MutableSpecTreeNode[];
  readonly decisions: SpecTreeDecision[];
};

type OrderedEntry = {
  readonly id: string;
  readonly order: number;
};

const ORDER_COMPARISON_EQUAL = 0;

export function getKindDefinition<K extends keyof SpecTreeRegistry>(
  kind: K,
  registry: SpecTreeRegistry = KIND_REGISTRY,
): KindDefinition<K> {
  return registry[kind];
}

export async function readSpecTree(options: SpecTreeOptions): Promise<SpecTreeSnapshot> {
  const entries = await collectSourceEntries(options.source);
  const product = entries.find(isProductEntry) ?? null;
  const evidenceByParent = groupEvidence(entries.filter(isEvidenceEntry));
  const decisions = entries.filter(isDecisionEntry).map(toDecision).sort(compareOrderedEntries);
  const decisionsByParent = groupDecisions(decisions);
  const nodesById = new Map<string, MutableSpecTreeNode>();

  for (const entry of entries.filter(isNodeEntry)) {
    const state = deriveState(entry, evidenceByParent.get(entry.id) ?? [], options.evidence);
    nodesById.set(entry.id, {
      id: entry.id,
      kind: entry.kind,
      order: entry.order,
      slug: entry.slug,
      parentId: entry.parentId,
      title: entry.title,
      ref: entry.ref,
      state,
      decisions: decisionsByParent.get(entry.id) ?? [],
      children: [],
    });
  }

  const roots: MutableSpecTreeNode[] = [];
  for (const node of nodesById.values()) {
    const parent = node.parentId === undefined ? undefined : nodesById.get(node.parentId);
    if (parent === undefined) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  sortNodes(roots);
  const allNodes = flattenNodes(roots);

  return {
    product: product === null
      ? null
      : {
        id: product.id,
        title: product.title,
        ref: product.ref,
      },
    nodes: roots,
    allNodes,
    decisions,
    entries,
  };
}

export function projectSpecTree(snapshot: SpecTreeSnapshot): SpecTreeProjection {
  return {
    version: SPEC_TREE_PROJECTION.VERSION,
    product: snapshot.product === null
      ? null
      : {
        id: snapshot.product.id,
        title: snapshot.product.title,
      },
    nodes: snapshot.nodes.map(projectNode),
    decisions: snapshot.decisions.map((decision) => ({
      id: decision.id,
      kind: decision.kind,
      order: decision.order,
      slug: decision.slug,
    })),
  };
}

export function findNextSpecTreeNode(snapshot: SpecTreeSnapshot): SpecTreeNode | null {
  return findFirstNonPassing(snapshot.nodes);
}

async function collectSourceEntries(source: SpecTreeSource): Promise<SpecTreeSourceEntry[]> {
  const entries: SpecTreeSourceEntry[] = [];
  for await (const entry of source.entries()) {
    entries.push(entry);
  }
  return entries;
}

function isProductEntry(entry: SpecTreeSourceEntry): entry is SpecTreeProductSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.PRODUCT;
}

function isNodeEntry(entry: SpecTreeSourceEntry): entry is SpecTreeNodeSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.NODE;
}

function isDecisionEntry(entry: SpecTreeSourceEntry): entry is SpecTreeDecisionSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.DECISION;
}

function isEvidenceEntry(entry: SpecTreeSourceEntry): entry is SpecTreeEvidenceSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE;
}

function toDecision(entry: SpecTreeDecisionSourceEntry): SpecTreeDecision {
  return {
    id: entry.id,
    kind: entry.kind,
    order: entry.order,
    slug: entry.slug,
    parentId: entry.parentId,
    title: entry.title,
    ref: entry.ref,
  };
}

function groupEvidence(
  entries: readonly SpecTreeEvidenceSourceEntry[],
): Map<string, SpecTreeEvidenceSourceEntry[]> {
  const grouped = new Map<string, SpecTreeEvidenceSourceEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.parentId) ?? [];
    group.push(entry);
    grouped.set(entry.parentId, group);
  }
  return grouped;
}

function groupDecisions(entries: readonly SpecTreeDecision[]): Map<string, SpecTreeDecision[]> {
  const grouped = new Map<string, SpecTreeDecision[]>();
  for (const entry of entries) {
    if (entry.parentId === undefined) continue;
    const group = grouped.get(entry.parentId) ?? [];
    group.push(entry);
    grouped.set(entry.parentId, group.sort(compareOrderedEntries));
  }
  return grouped;
}

function deriveState(
  node: SpecTreeNodeSourceEntry,
  evidence: readonly SpecTreeEvidenceSourceEntry[],
  provider?: SpecTreeEvidenceProvider,
): SpecTreeNodeState {
  const provided = provider?.stateForNode?.(node, evidence);
  if (provided !== undefined) return provided;
  if (evidence.length === 0) return SPEC_TREE_NODE_STATE.DECLARED;
  if (evidence.some((entry) => entry.status === SPEC_TREE_EVIDENCE_STATUS.FAILING)) {
    return SPEC_TREE_NODE_STATE.FAILING;
  }
  if (evidence.every((entry) => entry.status === SPEC_TREE_EVIDENCE_STATUS.PASSING)) {
    return SPEC_TREE_NODE_STATE.PASSING;
  }
  return SPEC_TREE_NODE_STATE.SPECIFIED;
}

function sortNodes(nodes: MutableSpecTreeNode[]): void {
  nodes.sort(compareOrderedEntries);
  for (const node of nodes) {
    sortNodes(node.children);
  }
}

function flattenNodes(nodes: readonly MutableSpecTreeNode[]): readonly SpecTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function projectNode(node: SpecTreeNode): SpecTreeProjectedNode {
  return {
    id: node.id,
    kind: node.kind,
    order: node.order,
    slug: node.slug,
    state: node.state,
    children: node.children.map(projectNode),
  };
}

function findFirstNonPassing(nodes: readonly SpecTreeNode[]): SpecTreeNode | null {
  for (const node of nodes) {
    if (node.state !== SPEC_TREE_NODE_STATE.PASSING) return node;
    const child = findFirstNonPassing(node.children);
    if (child !== null) return child;
  }
  return null;
}

function compareOrderedEntries(left: OrderedEntry, right: OrderedEntry): number {
  const orderComparison = left.order - right.order;
  if (orderComparison !== ORDER_COMPARISON_EQUAL) return orderComparison;
  return left.id.localeCompare(right.id);
}
