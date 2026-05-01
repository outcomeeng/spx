import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DecisionKind, Kind, KindDefinition, NodeKind, SpecTreeKindCategory } from "@/lib/spec-tree/config";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree/config";

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

export const SPEC_TREE_FILESYSTEM_RECORD_TYPE = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export type SpecTreeFilesystemRecordType =
  (typeof SPEC_TREE_FILESYSTEM_RECORD_TYPE)[keyof typeof SPEC_TREE_FILESYSTEM_RECORD_TYPE];

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

export type SpecTreeFilesystemRecord = {
  readonly type: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
  readonly parentId?: string;
};

export type SpecTreePathInclusionPredicate = (path: string) => boolean | Promise<boolean>;

export type FilesystemSpecTreeSourceOptions = {
  readonly projectRoot: string;
  readonly registry?: SpecTreeRegistry;
  readonly includePath?: SpecTreePathInclusionPredicate;
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
const SPEC_TREE_PATH_SEPARATOR = "/";
const SPEC_TREE_ORDER_SEPARATOR = "-";
const SPEC_TREE_ORDER_RADIX = 10;
const SPEC_TREE_TEXT_ENCODING = "utf8";
const SPEC_TREE_EMPTY_RELATIVE_PATH = "";
const SPEC_TREE_ORDER_PATTERN = /^\d+$/;

export function getKindDefinition<K extends keyof SpecTreeRegistry>(
  kind: K,
  registry: SpecTreeRegistry = KIND_REGISTRY,
): KindDefinition<K> {
  return registry[kind];
}

export function createFilesystemSpecTreeSource(options: FilesystemSpecTreeSourceOptions): SpecTreeSource {
  const registry = options.registry ?? KIND_REGISTRY;
  const includePath = options.includePath ?? includeEverySpecTreePath;

  return {
    entries: () => readFilesystemSourceEntries(options.projectRoot, registry, includePath),
    async readText(ref: SpecTreeSourceRef): Promise<string> {
      if (ref.path === undefined) {
        throw new Error("Filesystem source refs require a path");
      }
      return readFile(join(options.projectRoot, ref.path), SPEC_TREE_TEXT_ENCODING);
    },
  };
}

export function recognizeSpecTreeFilesystemEntry(
  record: SpecTreeFilesystemRecord,
  registry: SpecTreeRegistry = KIND_REGISTRY,
): SpecTreeSourceEntry | null {
  const name = readLastPathSegment(record.relativePath);

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE && isProductFile(record.relativePath)) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: record.relativePath,
      title: stripSuffix(name, SPEC_TREE_CONFIG.PRODUCT.SUFFIX),
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY) {
    const nodeMatch = matchKindSuffix(name, registry, SPEC_TREE_KIND_CATEGORY.NODE);
    if (nodeMatch === null) return null;
    const parsed = parseOrderedSlug(stripSuffix(name, nodeMatch.definition.suffix));
    if (parsed === null) return null;
    return {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      kind: nodeMatch.kind as NodeKind,
      id: record.relativePath,
      order: parsed.order,
      slug: parsed.slug,
      parentId: record.parentId,
      ref: sourceRefForNode(record.relativePath, parsed.slug),
    };
  }

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE) {
    const decisionMatch = matchKindSuffix(name, registry, SPEC_TREE_KIND_CATEGORY.DECISION);
    if (decisionMatch === null) return null;
    const parsed = parseOrderedSlug(stripSuffix(name, decisionMatch.definition.suffix));
    if (parsed === null) return null;
    return {
      type: SPEC_TREE_ENTRY_TYPE.DECISION,
      kind: decisionMatch.kind as DecisionKind,
      id: record.relativePath,
      order: parsed.order,
      slug: parsed.slug,
      parentId: record.parentId,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  return null;
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

async function* readFilesystemSourceEntries(
  projectRoot: string,
  registry: SpecTreeRegistry,
  includePath: SpecTreePathInclusionPredicate,
): AsyncIterable<SpecTreeSourceEntry> {
  yield* walkFilesystemDirectory({
    absolutePath: join(projectRoot, SPEC_TREE_CONFIG.ROOT_DIRECTORY),
    relativePath: SPEC_TREE_EMPTY_RELATIVE_PATH,
    registry,
    includePath,
  });
}

type FilesystemWalkContext = {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly registry: SpecTreeRegistry;
  readonly includePath: SpecTreePathInclusionPredicate;
  readonly parentId?: string;
};

async function* walkFilesystemDirectory(context: FilesystemWalkContext): AsyncIterable<SpecTreeSourceEntry> {
  let entries;
  try {
    entries = await readdir(context.absolutePath, { withFileTypes: true });
  } catch (error) {
    if (isFileNotFound(error)) return;
    throw error;
  }

  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sortedEntries) {
    const relativePath = joinSpecTreePath(context.relativePath, entry.name);
    const refPath = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
    if (!await context.includePath(refPath)) continue;

    const recordType = entry.isDirectory()
      ? SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY
      : entry.isFile()
      ? SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE
      : undefined;
    if (recordType === undefined) continue;

    const sourceEntry = recognizeSpecTreeFilesystemEntry(
      { type: recordType, relativePath, parentId: context.parentId },
      context.registry,
    );
    if (sourceEntry !== null) yield sourceEntry;

    if (entry.isDirectory()) {
      yield* walkFilesystemDirectory({
        absolutePath: join(context.absolutePath, entry.name),
        relativePath,
        registry: context.registry,
        includePath: context.includePath,
        parentId: sourceEntry?.type === SPEC_TREE_ENTRY_TYPE.NODE ? sourceEntry.id : context.parentId,
      });
    }
  }
}

type KindSuffixMatch = {
  readonly kind: string;
  readonly definition: KindDefinition<Kind>;
};

function matchKindSuffix(
  name: string,
  registry: SpecTreeRegistry,
  category: SpecTreeKindCategory,
): KindSuffixMatch | null {
  for (const [kind, definition] of Object.entries(registry) as Array<[Kind, KindDefinition<Kind>]>) {
    if (definition.category === category && name.endsWith(definition.suffix)) {
      return { kind, definition };
    }
  }
  return null;
}

type OrderedSlug = {
  readonly order: number;
  readonly slug: string;
};

function parseOrderedSlug(value: string): OrderedSlug | null {
  const separatorIndex = value.indexOf(SPEC_TREE_ORDER_SEPARATOR);
  if (separatorIndex <= ORDER_COMPARISON_EQUAL) return null;
  const orderText = value.slice(0, separatorIndex);
  if (!SPEC_TREE_ORDER_PATTERN.test(orderText)) return null;
  const slug = value.slice(separatorIndex + SPEC_TREE_ORDER_SEPARATOR.length);
  if (slug.length === 0) return null;
  return {
    order: Number.parseInt(orderText, SPEC_TREE_ORDER_RADIX),
    slug,
  };
}

function isProductFile(relativePath: string): boolean {
  return !relativePath.includes(SPEC_TREE_PATH_SEPARATOR) && relativePath.endsWith(SPEC_TREE_CONFIG.PRODUCT.SUFFIX);
}

function sourceRefForRelativePath(relativePath: string): SpecTreeSourceRef {
  const path = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
  return { id: path, path };
}

function sourceRefForNode(relativePath: string, slug: string): SpecTreeSourceRef {
  return sourceRefForRelativePath(joinSpecTreePath(relativePath, `${slug}.md`));
}

function stripSuffix(value: string, suffix: string): string {
  return value.slice(0, value.length - suffix.length);
}

function readLastPathSegment(relativePath: string): string {
  const segments = relativePath.split(SPEC_TREE_PATH_SEPARATOR);
  return segments[segments.length - 1] ?? relativePath;
}

function joinSpecTreePath(...segments: readonly string[]): string {
  return segments.filter((segment) => segment.length > 0).join(SPEC_TREE_PATH_SEPARATOR);
}

function includeEverySpecTreePath(): boolean {
  return true;
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
