import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDocument } from "yaml";

import { readConfigSectionFromReadResult, readProductConfigFile } from "@/config/index";
import { METHODOLOGY_SECTION, validateMethodologyConfig } from "@/config/methodology";
import type { Result } from "@/config/types";

import type {
  DecisionKind,
  Kind,
  KindDefinition,
  NamingSchemaVersion,
  NodeDirectoryKind,
  ProductKind,
  SpecTreeKindCategory,
  SpecTreeNodeState,
} from "./config";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NODE_STATE,
} from "./config";
import { compareSpecContextOrdinal } from "./context-manifest";
import { splitSpecContextFrontMatter } from "./context-projection";
import { deriveNamingSchemaSelection, type NamingSchemaSelection, versionsBeforeTarget } from "./naming-schema-selection";
export {
  compareNamingSchemaVersions,
  compareNumericVersionIdentifiers,
  DECISION_KINDS,
  DECISION_SUFFIXES,
  isSpecTreeKind,
  KIND_REGISTRY,
  newestNamingSchemaVersion,
  NODE_KINDS,
  NODE_SUFFIXES,
  PRODUCT_KINDS,
  resolveKindAdmittedChildren,
  resolveKindOpeningForm,
  resolveKindOpeningKeyword,
  SPEC_TREE_ADR_KIND,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_KIND_SELECTOR,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_VERSION,
  SPEC_TREE_NODE_STATE,
  SPEC_TREE_OPENING_KEYWORD,
  SPEC_TREE_PRODUCT_KIND,
  SPEC_TREE_SECTION,
  specTreeConfigDescriptor,
  specTreeKindsFieldError,
} from "./config";
export type {
  DecisionKind,
  Kind,
  KindDefinition,
  NamingSchemaVersion,
  NodeDirectoryKind,
  NodeKind,
  ProductKind,
  SpecTreeConfig,
  SpecTreeEntryType,
  SpecTreeEvidenceGrammar,
  SpecTreeKindCategory,
  SpecTreeNodeState,
  SpecTreeOrderGrammar,
} from "./config";
export {
  deriveNamingSchemaSelection,
  formatUnreadMethodologyLineError,
  namingSchemaMethodologyLines,
  supersededNodeSuffixes,
  versionsBeforeTarget,
} from "./naming-schema-selection";
export type { NamingSchemaDeclaration, NamingSchemaSelection } from "./naming-schema-selection";
export {
  compareSpecContextOrdinal,
  compareSpecContextRoleBindings,
  composeSpecContextManifestSelection,
  decodeContextDocumentUtf8,
  extractDecisionCitations,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_ROLE,
  SPEC_CONTEXT_ROLE_ORDER,
  specContextBootstrap,
} from "./context-manifest";
export type {
  SpecContextManifest,
  SpecContextManifestEntry,
  SpecContextManifestSelection,
  SpecContextRole,
  SpecContextRoleBinding,
  SpecContextTargetCoverage,
} from "./context-manifest";
export {
  projectSpecContextDocument,
  renderSpecContextEntries,
  selectSpecContextDocuments,
  SPEC_CONTEXT_DOCUMENT_OPENING,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_FRAME_SYNTAX,
  SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_ROLE_MODE,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  specContextBoundCitations,
  specContextCitedSelection,
  specContextInlineDecisionCitations,
  specContextOptionalArtifactPaths,
  splitSpecContextFrontMatter,
} from "./context-projection";
export type {
  SpecContextDocumentEntry,
  SpecContextEntry,
  SpecContextMode,
  SpecContextProjectedEntry,
  SpecContextSelection,
} from "./context-projection";
export {
  specContextAncestors,
  specContextDecisions,
  specContextLowerIndexSiblings,
  specContextSiblings,
} from "./context-read-set";
export {
  resolveSpecContextTarget,
  SPEC_CONTEXT_TARGET_FAILURE_KIND,
  specContextAcceptedPaths,
  specContextSuffixCandidates,
} from "./context-target";
export type {
  SpecContextAcceptedPath,
  SpecContextTarget,
  SpecContextTargetFailure,
  SpecContextTargetFailureKind,
  SpecContextTargetPathFacts,
  SpecContextTargetResolution,
} from "./context-target";
export { resolveSpecTreePathOwnership, SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND } from "./path-ownership";
export type {
  SpecTreePathOwnershipResolved,
  SpecTreePathOwnershipResult,
  SpecTreePathOwnershipResultKind,
  SpecTreePathOwnershipUnresolved,
} from "./path-ownership";

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
  TITLE: "title",
} as const;

export const SPEC_TREE_FILESYSTEM_RECORD_TYPE = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export type SpecTreeFilesystemRecordType =
  (typeof SPEC_TREE_FILESYSTEM_RECORD_TYPE)[keyof typeof SPEC_TREE_FILESYSTEM_RECORD_TYPE];

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
  PRODUCT_KEYS: {
    ID: SPEC_TREE_FIELD_KEY.ID,
    TITLE: SPEC_TREE_FIELD_KEY.TITLE,
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
  /** The `kind` the product spec's front matter must declare, when its naming-schema version requires one. */
  readonly frontMatterKind?: ProductKind;
};

export type SpecTreeNodeSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.NODE;
  readonly kind: NodeDirectoryKind;
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

export type SpecTreeSupersededSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.SUPERSEDED;
  readonly version: string;
  readonly parentId?: string;
};

export type SpecTreeInvalidSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.INVALID;
  readonly parentId?: string;
};

export type SpecTreeSourceEntry =
  | SpecTreeProductSourceEntry
  | SpecTreeNodeSourceEntry
  | SpecTreeDecisionSourceEntry
  | SpecTreeEvidenceSourceEntry
  | SpecTreeSupersededSourceEntry
  | SpecTreeInvalidSourceEntry;

export type SpecTreeSource = {
  entries(): AsyncIterable<SpecTreeSourceEntry>;
  /** The naming-schema versions this source's records classify against, and those its product's methodology declaration selects. */
  namingSchemaSelection(): Promise<NamingSchemaSelection>;
  readText?(ref: SpecTreeSourceRef): Promise<string>;
};

export type SpecTreeFilesystemRecord = {
  readonly type: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
  readonly parentId?: string;
};

export type SpecTreePathInclusionPredicate = (path: string) => boolean | Promise<boolean>;

export type FilesystemSpecTreeSourceOptions = {
  readonly productDir: string;
  readonly registry?: SpecTreeRegistry;
  readonly schemaVersions?: readonly NamingSchemaVersion[];
  readonly includePath?: SpecTreePathInclusionPredicate;
};

export type SpecTreeRecognitionOptions = {
  readonly registry?: SpecTreeRegistry;
  readonly selection: NamingSchemaSelection;
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
  readonly kind: NodeDirectoryKind;
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
  readonly superseded: readonly SpecTreeSupersededSourceEntry[];
  readonly residual: readonly SpecTreeInvalidSourceEntry[];
  readonly entries: readonly SpecTreeSourceEntry[];
};

export type SpecTreeProjectedNode = {
  readonly id: string;
  readonly kind: NodeDirectoryKind;
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
const SPEC_TREE_PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SPEC_TREE_ORDER_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;
const SPEC_TREE_ORDER_RADIX = 10;
const SPEC_TREE_TEXT_ENCODING = "utf8";
const SPEC_TREE_EMPTY_RELATIVE_PATH = "";
const SPEC_TREE_MIN_EVIDENCE_PATH_SEGMENTS = 2;
const SPEC_TREE_PARENT_SEGMENT_OFFSET = 2;
const SPEC_TREE_FIRST_EVIDENCE_MARKER_INDEX = 1;
const SPEC_TREE_EXACTLY_ONE_EVIDENCE_MARKER = 1;
const SPEC_TREE_SINGLE_PRODUCT = 1;
const SPEC_TREE_FRONT_MATTER_KIND_KEY = "kind";
const SPEC_TREE_LIST_SEPARATOR = ", ";

export function getKindDefinition<K extends keyof SpecTreeRegistry>(
  kind: K,
  registry: SpecTreeRegistry = KIND_REGISTRY,
): KindDefinition<K> {
  return registry[kind];
}

/**
 * The selection a product's `methodology` configuration section derives over the
 * naming-schema versions: the section is validated as methodology configuration, then
 * its declaration selects the versions a read accepts.
 */
export function resolveNamingSchemaSelection(
  methodologySection: unknown,
  versions: readonly NamingSchemaVersion[] = SPEC_TREE_NAMING_SCHEMA_VERSIONS,
): Result<NamingSchemaSelection> {
  const methodology = validateMethodologyConfig(methodologySection ?? {});
  if (!methodology.ok) return { ok: false, error: `${METHODOLOGY_SECTION}: ${methodology.error}` };
  return deriveNamingSchemaSelection(versions, methodology.value);
}

async function resolveFilesystemNamingSchemaSelection(
  productDir: string,
  versions: readonly NamingSchemaVersion[],
): Promise<NamingSchemaSelection> {
  const configFile = await readProductConfigFile(productDir);
  if (!configFile.ok) throw new Error(configFile.error);
  const section = readConfigSectionFromReadResult(configFile.value, METHODOLOGY_SECTION);
  if (!section.ok) throw new Error(section.error);
  const selection = resolveNamingSchemaSelection(section.value, versions);
  if (!selection.ok) throw new Error(`Cannot read the spec tree under ${productDir}: ${selection.error}`);
  return selection.value;
}

export function createFilesystemSpecTreeSource(options: FilesystemSpecTreeSourceOptions): SpecTreeSource {
  const registry = options.registry ?? KIND_REGISTRY;
  const schemaVersions = options.schemaVersions ?? SPEC_TREE_NAMING_SCHEMA_VERSIONS;
  const includePath = options.includePath ?? includeEverySpecTreePath;
  let selection: Promise<NamingSchemaSelection> | undefined;
  const namingSchemaSelection = (): Promise<NamingSchemaSelection> => {
    selection ??= resolveFilesystemNamingSchemaSelection(options.productDir, schemaVersions);
    return selection;
  };

  return {
    entries: () => readFilesystemSourceEntries(options.productDir, registry, namingSchemaSelection, includePath),
    namingSchemaSelection,
    async readText(ref: SpecTreeSourceRef): Promise<string> {
      if (ref.path === undefined) {
        throw new Error("Filesystem source refs require a path");
      }
      return readFile(join(options.productDir, ref.path), SPEC_TREE_TEXT_ENCODING);
    },
  };
}

export function recognizeSpecTreeFilesystemEntry(
  record: SpecTreeFilesystemRecord,
  options: SpecTreeRecognitionOptions,
): SpecTreeSourceEntry | null {
  const registry = options.registry ?? KIND_REGISTRY;
  const selection = options.selection;
  const name = readLastPathSegment(record.relativePath);

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE && isProductRootPath(record.relativePath)) {
    const productEntry = recognizeProductRecord(record, name, selection);
    if (productEntry !== null) return productEntry;
  }

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY) {
    return recognizeDirectoryRecord(record, name, registry, selection);
  }

  if (
    record.parentId !== undefined
    && selection.selected.some((version) => isEvidenceFile(record.relativePath, version))
  ) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.EVIDENCE,
      id: record.relativePath,
      parentId: record.parentId,
      status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  const decisionMatch = matchKindSuffix(name, registry, SPEC_TREE_KIND_CATEGORY.DECISION);
  if (decisionMatch === null) return null;
  const parsed = selection.selected
    .map((version) => parseOrderedSlug(stripSuffix(name, decisionMatch.definition.suffix), version.order.PATTERN))
    .find((candidate) => candidate !== null);
  if (parsed === undefined || parsed === null) return null;
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

function productTitle(name: string, version: NamingSchemaVersion): string | null {
  if (!name.endsWith(version.productSuffix)) return null;
  const title = stripSuffix(name, version.productSuffix);
  return title.length === 0 ? null : title;
}

function recognizeProductRecord(
  record: SpecTreeFilesystemRecord,
  name: string,
  selection: NamingSchemaSelection,
): SpecTreeSourceEntry | null {
  for (const version of selection.selected) {
    const title = productTitle(name, version);
    if (title === null) continue;
    return {
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: record.relativePath,
      title,
      ref: sourceRefForRelativePath(record.relativePath),
      ...(version.productKind === undefined ? {} : { frontMatterKind: version.productKind }),
    };
  }
  const superseded = versionsBeforeTarget(selection).find((version) => productTitle(name, version) !== null);
  if (superseded === undefined) return null;
  return {
    type: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
    id: record.relativePath,
    version: superseded.version,
    ref: sourceRefForRelativePath(record.relativePath),
  };
}

function recognizeDirectoryRecord(
  record: SpecTreeFilesystemRecord,
  name: string,
  registry: SpecTreeRegistry,
  selection: NamingSchemaSelection,
): SpecTreeSourceEntry | null {
  for (const version of selection.selected) {
    const match = matchNodeSuffixFromVersion(name, version);
    if (match === null) continue;
    const kind = nodeDirectoryKindForSuffix(match.suffix, registry);
    if (kind === null) continue;
    return {
      type: SPEC_TREE_ENTRY_TYPE.NODE,
      kind,
      id: record.relativePath,
      order: match.parsed.order,
      slug: match.parsed.slug,
      parentId: record.parentId,
      ref: sourceRefForNode(record.relativePath, match.parsed.slug, version.specFileSuffix),
    };
  }

  const supersededVersion = matchSupersededNodeVersion(name, selection);
  if (supersededVersion !== null) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
      id: record.relativePath,
      version: supersededVersion,
      parentId: record.parentId,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  if (matchKindSuffix(name, registry, SPEC_TREE_KIND_CATEGORY.DECISION) !== null) return null;

  // An ordered-form attempt: parseOrderedSlug folds the unrecognized suffix into the
  // slug component (it splits on the first separator and accepts any non-empty slug),
  // so a `{NN}-{slug}{unknown-suffix}` directory parses here under some version's index
  // form and is retained as invalid rather than dropped.
  if (selection.versions.some((version) => parseOrderedSlug(name, version.order.PATTERN) !== null)) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.INVALID,
      id: record.relativePath,
      parentId: record.parentId,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  return null;
}

type NodeSuffixMatch = {
  readonly suffix: string;
  readonly parsed: OrderedSlug;
};

function matchNodeSuffixFromVersion(name: string, version: NamingSchemaVersion): NodeSuffixMatch | null {
  for (const suffix of version.nodeSuffixes) {
    if (!name.endsWith(suffix)) continue;
    const parsed = parseOrderedSlug(stripSuffix(name, suffix), version.order.PATTERN);
    if (parsed !== null) {
      return { suffix, parsed };
    }
  }
  return null;
}

function nodeDirectoryKindForSuffix(suffix: string, registry: SpecTreeRegistry): NodeDirectoryKind | null {
  for (const [kind, definition] of Object.entries(registry) as Array<[Kind, KindDefinition<Kind>]>) {
    if (definition.category === SPEC_TREE_KIND_CATEGORY.DECISION) continue;
    if (definition.suffix === suffix) {
      return kind as NodeDirectoryKind;
    }
  }
  return null;
}

function matchSupersededNodeVersion(name: string, selection: NamingSchemaSelection): string | null {
  if (selection.selected.some((version) => matchNodeSuffixFromVersion(name, version) !== null)) return null;
  const superseded = versionsBeforeTarget(selection).find((version) =>
    matchNodeSuffixFromVersion(name, version) !== null
  );
  return superseded?.version ?? null;
}

export async function readSpecTree(options: SpecTreeOptions): Promise<SpecTreeSnapshot> {
  const entries = await collectSourceEntries(options.source);
  const product = await requireSingleProduct(entries.filter(isProductEntry), options.source);
  const superseded = entries.filter(isSupersededEntry);
  const residual = entries.filter(isInvalidEntry);
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
    superseded,
    residual,
    entries,
  };
}

/**
 * The tree's one root product spec, or none: a tree holding more than one fails naming
 * each, and a product spec whose naming-schema version requires a front-matter `kind`
 * fails naming its file when the front matter does not declare that kind.
 */
async function requireSingleProduct(
  products: readonly SpecTreeProductSourceEntry[],
  source: SpecTreeSource,
): Promise<SpecTreeProductSourceEntry | null> {
  if (products.length > SPEC_TREE_SINGLE_PRODUCT) {
    throw new Error(
      `A spec tree holds exactly one root product spec; found ${products.length}: ${
        products.map((product) => product.id).join(SPEC_TREE_LIST_SEPARATOR)
      }`,
    );
  }
  const product = products.at(0);
  if (product === undefined) return null;
  if (product.frontMatterKind !== undefined) {
    await requireProductFrontMatterKind(product, product.frontMatterKind, source);
  }
  return product;
}

async function requireProductFrontMatterKind(
  product: SpecTreeProductSourceEntry,
  kind: ProductKind,
  source: SpecTreeSource,
): Promise<void> {
  const path = product.ref?.path ?? product.id;
  if (product.ref === undefined || source.readText === undefined) {
    throw new Error(`Root product spec ${path} must declare kind: ${kind}, and its source cannot read it`);
  }
  const declared = frontMatterKind(await source.readText(product.ref), path);
  if (declared !== kind) {
    throw new Error(`Root product spec ${path} must declare kind: ${kind} in its front matter`);
  }
}

function frontMatterKind(text: string, path: string): unknown {
  const { frontMatter } = splitSpecContextFrontMatter(text, path);
  if (frontMatter === undefined) return undefined;
  const document = parseDocument(frontMatter);
  if (document.errors.length > 0) {
    throw new Error(`Invalid front matter in ${path}: ${document.errors[0]?.message}`);
  }
  const metadata: unknown = document.toJS();
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return undefined;
  return (metadata as Readonly<Record<string, unknown>>)[SPEC_TREE_FRONT_MATTER_KIND_KEY];
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

function isSupersededEntry(entry: SpecTreeSourceEntry): entry is SpecTreeSupersededSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED;
}

function isInvalidEntry(entry: SpecTreeSourceEntry): entry is SpecTreeInvalidSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.INVALID;
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
    group.sort(compareOrderedEntries);
    grouped.set(entry.parentId, group);
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
  return compareSpecContextOrdinal(left.id, right.id);
}

async function* readFilesystemSourceEntries(
  productDir: string,
  registry: SpecTreeRegistry,
  namingSchemaSelection: () => Promise<NamingSchemaSelection>,
  includePath: SpecTreePathInclusionPredicate,
): AsyncIterable<SpecTreeSourceEntry> {
  const absolutePath = join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  const rootEntries = await readDirectoryEntries(absolutePath);
  if (rootEntries === null) return;
  yield* walkFilesystemEntries(rootEntries, {
    absolutePath,
    relativePath: SPEC_TREE_EMPTY_RELATIVE_PATH,
    registry,
    selection: await namingSchemaSelection(),
    includePath,
  });
}

type FilesystemWalkContext = {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly registry: SpecTreeRegistry;
  readonly selection: NamingSchemaSelection;
  readonly includePath: SpecTreePathInclusionPredicate;
  readonly parentId?: string;
};

async function readDirectoryEntries(absolutePath: string): Promise<readonly Dirent[] | null> {
  try {
    return await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if (isFileNotFound(error)) return null;
    throw error;
  }
}

async function* walkFilesystemEntries(
  entries: readonly Dirent[],
  context: FilesystemWalkContext,
): AsyncIterable<SpecTreeSourceEntry> {
  const sortedEntries = [...entries].sort((left, right) => compareSpecContextOrdinal(left.name, right.name));
  for (const entry of sortedEntries) {
    const relativePath = joinSpecTreePath(context.relativePath, entry.name);
    const refPath = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
    if (!await context.includePath(refPath)) continue;

    const recordType = filesystemRecordType(entry);
    if (recordType === undefined) continue;

    const sourceEntry = recognizeSpecTreeFilesystemEntry(
      { type: recordType, relativePath, parentId: context.parentId },
      { registry: context.registry, selection: context.selection },
    );
    if (sourceEntry !== null) yield sourceEntry;

    if (entry.isDirectory() && shouldDescendIntoDirectory(sourceEntry)) {
      const absolutePath = join(context.absolutePath, entry.name);
      const childEntries = await readDirectoryEntries(absolutePath);
      if (childEntries === null) continue;
      yield* walkFilesystemEntries(childEntries, {
        absolutePath,
        relativePath,
        registry: context.registry,
        selection: context.selection,
        includePath: context.includePath,
        parentId: childParentId(context, sourceEntry),
      });
    }
  }
}

function filesystemRecordType(entry: Dirent): SpecTreeFilesystemRecord["type"] | undefined {
  if (entry.isDirectory()) return SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY;
  if (entry.isFile()) return SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE;
  return undefined;
}

function childParentId(
  context: FilesystemWalkContext,
  sourceEntry: SpecTreeSourceEntry | null,
): string | undefined {
  return sourceEntry?.type === SPEC_TREE_ENTRY_TYPE.NODE ? sourceEntry.id : context.parentId;
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

function parseOrderedSlug(value: string, orderPattern: RegExp): OrderedSlug | null {
  const separatorIndex = value.indexOf(SPEC_TREE_ORDER_SEPARATOR);
  if (separatorIndex <= ORDER_COMPARISON_EQUAL) return null;
  const orderText = value.slice(0, separatorIndex);
  if (!orderPattern.test(orderText)) return null;
  const slug = value.slice(separatorIndex + SPEC_TREE_ORDER_SEPARATOR.length);
  if (slug.length === 0) return null;
  return {
    order: Number.parseInt(orderText, SPEC_TREE_ORDER_RADIX),
    slug,
  };
}

function isProductRootPath(relativePath: string): boolean {
  return !relativePath.includes(SPEC_TREE_PATH_SEPARATOR);
}

function isEvidenceFile(relativePath: string, version: NamingSchemaVersion): boolean {
  const segments = relativePath.split(version.pathSeparator);
  if (segments.length < SPEC_TREE_MIN_EVIDENCE_PATH_SEGMENTS) return false;

  const filename = segments.at(-1) ?? "";
  const directoryName = segments.at(-SPEC_TREE_PARENT_SEGMENT_OFFSET);
  const filenameSegments = filename.split(version.evidence.SEGMENT_SEPARATOR);
  const evidenceFileTails = Object.values(version.evidence.TAILS);

  return directoryName === version.evidence.DIRECTORY_NAME
    && evidenceFileTails.some((tail) =>
      version.evidence.MODES.some((mode) =>
        version.evidence.LEVELS.some((level) => filenameHasEvidenceSuffix(filenameSegments, mode, level, tail))
      )
    );
}

function filenameHasEvidenceSuffix(
  filenameSegments: readonly string[],
  mode: string,
  level: string,
  tail: readonly string[],
): boolean {
  if (!segmentsEndWith(filenameSegments, tail)) return false;
  const tailStart = filenameSegments.length - tail.length;
  let evidenceMarkerCount = 0;

  // Exactly one mode/level pair prevents ambiguous filenames from being treated as evidence.
  for (let index = SPEC_TREE_FIRST_EVIDENCE_MARKER_INDEX; index < tailStart - 1; index += 1) {
    if (filenameSegments[index] === mode && filenameSegments[index + 1] === level) {
      evidenceMarkerCount += 1;
    }
  }

  return evidenceMarkerCount === SPEC_TREE_EXACTLY_ONE_EVIDENCE_MARKER;
}

function segmentsEndWith(segments: readonly string[], suffix: readonly string[]): boolean {
  if (segments.length <= suffix.length) return false;
  const start = segments.length - suffix.length;
  return suffix.every((value, index) => segments[start + index] === value);
}

function shouldDescendIntoDirectory(sourceEntry: SpecTreeSourceEntry | null): boolean {
  return sourceEntry === null || sourceEntry.type === SPEC_TREE_ENTRY_TYPE.NODE;
}

function sourceRefForRelativePath(relativePath: string): SpecTreeSourceRef {
  const path = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
  return { id: path, path };
}

function sourceRefForNode(relativePath: string, slug: string, specFileSuffix: string): SpecTreeSourceRef {
  return sourceRefForRelativePath(joinSpecTreePath(relativePath, `${slug}${specFileSuffix}`));
}

function stripSuffix(value: string, suffix: string): string {
  return value.slice(0, value.length - suffix.length);
}

function readLastPathSegment(relativePath: string): string {
  const segments = relativePath.split(SPEC_TREE_PATH_SEPARATOR);
  return segments.at(-1) ?? relativePath;
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
