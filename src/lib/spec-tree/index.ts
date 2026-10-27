import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";

import { resolveMethodologyConfig, resolveMethodologyConfigFromReadResult } from "@/config/methodology-resolution";
import { detectProductConfigFile } from "@/config/product-file";
import type { Result } from "@/config/types";

import type {
  DecisionKind,
  Kind,
  KindDefinition,
  NamingSchemaVersion,
  ProductKind,
  SpecTreeContainerKind,
  SpecTreeEvidenceGrammar,
  SpecTreeKindCategory,
  SpecTreeKnowledgeRootHolder,
  SpecTreeNodeKind,
  SpecTreeNodeState,
} from "./config";
import {
  acceptsEvalLaneEntry,
  acceptsKnowledgeRoot,
  acceptsNodeLocalNote,
  acceptsProbeEntry,
  canonicalNamingSchemaVersion,
  KIND_REGISTRY,
  OUTPUT_KINDS,
  resolveAdmittedChildren,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVAL_ENTRY_KIND,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_KNOWLEDGE_ROOT_HOLDER,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NODE_STATE,
} from "./config";
import { compareSpecContextOrdinal } from "./context-manifest";
import { isFileNotFound, readSpecEvidenceReferences, type SpecTreeEvidenceReference } from "./evidence-references";
import {
  priorNamingSchemaVersions,
  selectSpecTreeGrammar,
  type SpecTreeGrammarSelection,
  type SpecTreeMethodologyDeclaration,
} from "./grammar-selection";
import { createSpecTreeLinkGrammar, type SpecTreeLinkGrammar } from "./link-grammar";
import { compareSpecTreeOrder } from "./order";
export {
  acceptsEvalLaneEntry,
  acceptsKnowledgeRoot,
  acceptsNodeLocalNote,
  acceptsProbeEntry,
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  compareNumericVersionIdentifiers,
  DECISION_KINDS,
  DECISION_SUFFIXES,
  KIND_REGISTRY,
  NODE_KINDS,
  NODE_SUFFIXES,
  OUTPUT_KINDS,
  OUTPUT_SUFFIXES,
  resolveAdmittedChildren,
  resolveKindLabel,
  resolveKindOpening,
  SPEC_TREE_ADR_KIND,
  SPEC_TREE_CONFIG,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVAL_ENTRY_KIND,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_INHERIT_FROM_PARENT,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_KNOWLEDGE_ROOT_HOLDER,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_VERSION,
  SPEC_TREE_NODE_STATE,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
  SPEC_TREE_SECTION,
  specTreeConfigDescriptor,
  supersededNodeSuffixes,
} from "./config";
export type {
  DecisionKind,
  Kind,
  KindDefinition,
  NamingSchemaVersion,
  NodeKind,
  OutputKind,
  ProductKind,
  SpecTreeConfig,
  SpecTreeContainerKind,
  SpecTreeEntryType,
  SpecTreeEvalEntryKind,
  SpecTreeEvidenceGrammar,
  SpecTreeKindCategory,
  SpecTreeKnowledgeRootHolder,
  SpecTreeMethodologyLine,
  SpecTreeNodeKind,
  SpecTreeNodeState,
} from "./config";
export {
  compareSpecContextOrdinal,
  composeSpecContextManifestEntries,
  decodeContextDocumentUtf8,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_MODE_NAME,
  SPEC_CONTEXT_REASON_MODE,
  SPEC_CONTEXT_SELECTION_REASON,
  SPEC_CONTEXT_SELECTION_REASON_PRECEDENCE,
  specContextBootstrap,
  specContextReasonsMode,
  specContextTargetSelections,
} from "./context-manifest";
export type {
  SpecContextManifest,
  SpecContextManifestEntry,
  SpecContextMode,
  SpecContextModeName,
  SpecContextSelectedEntry,
  SpecContextSelectionReason,
  SpecContextTargetSelection,
} from "./context-manifest";
export {
  projectSpecContextDocument,
  renderSpecContextEntries,
  selectSpecContextDocuments,
  SPEC_CONTEXT_DIGEST_SOURCE,
  SPEC_CONTEXT_ENTRY_TYPE,
  SPEC_CONTEXT_FRAME,
  SPEC_CONTEXT_FRAME_SYNTAX,
  SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR,
  SPEC_CONTEXT_OPTIONAL_ARTIFACT,
  SPEC_CONTEXT_PROJECTION_FAILURE_KIND,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  specContextBoundCitations,
  specContextCitedSelection,
  specContextInlineDecisionCitations,
  specContextOptionalArtifactPaths,
  SpecContextProjectionError,
  splitSpecContextFrontMatter,
} from "./context-projection";
export type {
  SpecContextDocumentEntry,
  SpecContextEntry,
  SpecContextKindRegistry,
  SpecContextProjectedEntry,
  SpecContextProjectionFailureKind,
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
  SPEC_CONTEXT_PRODUCT_ROOT_TARGET,
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
export {
  SPEC_TREE_EVIDENCE_KEY_KIND,
  SPEC_TREE_EVIDENCE_TARGET,
  SPEC_TREE_VERIFICATION_TYPE,
} from "./evidence-references";
export type {
  SpecTreeEvidenceKey,
  SpecTreeEvidenceReference,
  SpecTreeEvidenceTarget,
  SpecTreeVerificationType,
} from "./evidence-references";
export {
  selectedSupersededNodeSuffixes,
  selectSpecTreeGrammar,
  SPEC_TREE_DECLARATION_FIELD,
} from "./grammar-selection";
export type { SpecTreeGrammarSelection, SpecTreeMethodologyDeclaration } from "./grammar-selection";
export {
  admitsSpecTreeLinkText,
  createSpecTreeLinkGrammar,
  isSpecTreeEvidenceLinkText,
  SPEC_TREE_ASSERTION_BULLET_PREFIX,
  SPEC_TREE_ASSERTIONS_HEADING,
  SPEC_TREE_AUDIT_TAG_SLUG_SEPARATOR,
  SPEC_TREE_AUDIT_TAG_TEXT,
  SPEC_TREE_EVIDENCE_LINK_TEXT,
  SPEC_TREE_EVIDENCE_LINK_TEXTS,
  SPEC_TREE_LINK_KIND,
  SPEC_TREE_LINK_PARENT_SEGMENT,
  SPEC_TREE_LINK_ROOT_ANCHOR,
  SPEC_TREE_ROOT_PREFIX,
  SPEC_TREE_SECTION_HEADING_PREFIX,
} from "./link-grammar";
export type {
  SpecTreeEvidenceLinkText,
  SpecTreeLink,
  SpecTreeLinkGrammar,
  SpecTreeLinkKind,
  SpecTreeLinkRecognition,
} from "./link-grammar";
export { compareSpecTreeOrder } from "./order";
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
};

export type SpecTreeNodeSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.NODE;
  readonly kind: SpecTreeContainerKind;
  /** The index's numeric segments, compared segment by segment by `compareSpecTreeOrder`. */
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
};

export type SpecTreeDecisionSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.DECISION;
  readonly kind: DecisionKind;
  /** The index's numeric segments, compared segment by segment by `compareSpecTreeOrder`. */
  readonly orderSegments: readonly number[];
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
  /** The index's numeric segments; the unindexed root spec file carries the empty segment list. */
  readonly orderSegments: readonly number[];
  readonly parentId?: string;
};

export type SpecTreeInvalidSourceEntry = SpecTreeSourceEntryBase & {
  readonly type: typeof SPEC_TREE_ENTRY_TYPE.INVALID;
  /** The index's numeric segments, compared segment by segment by `compareSpecTreeOrder`. */
  readonly orderSegments: readonly number[];
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
  readText?(ref: SpecTreeSourceRef): Promise<string>;
  /**
   * The link grammar of the grammar selection and kind registry the source reads its entries
   * under, which evidence-reference reading judges link targets by. A source that declares none
   * is judged by every known naming-schema version.
   */
  linkGrammar?(): Promise<SpecTreeLinkGrammar>;
  /**
   * The grammar selection the source reads its entries under, which kind containment is judged
   * by. A source that declares none is judged by every known naming-schema version.
   */
  grammarSelection?(): Promise<SpecTreeGrammarSelection>;
};

export type SpecTreeFilesystemRecord = {
  readonly type: SpecTreeFilesystemRecordType;
  readonly relativePath: string;
  readonly parentId?: string;
  /** The `kind` a root spec file declares in its front matter, read by the source that holds the file's text. */
  readonly declaredKind?: string;
};

export type SpecTreePathInclusionPredicate = (path: string) => boolean | Promise<boolean>;

export type SpecTreeMethodologyResolver = (productDir: string) => Promise<Result<SpecTreeMethodologyDeclaration>>;

export type FilesystemSpecTreeSourceOptions = {
  readonly productDir: string;
  readonly registry?: SpecTreeRegistry;
  /** The grammar the source reads, carrying the versions it knows with the ones it selects. Without it, the product's methodology declaration selects it. */
  readonly selection?: SpecTreeGrammarSelection;
  /** Reads the product's methodology declaration; the production resolver reads the product configuration. */
  readonly resolveMethodology?: SpecTreeMethodologyResolver;
  readonly includePath?: SpecTreePathInclusionPredicate;
};

export type SpecTreeRecognitionOptions = {
  readonly registry?: SpecTreeRegistry;
  /** The versions the recognizer knows. */
  readonly schemaVersions: readonly NamingSchemaVersion[];
  /** The members of `schemaVersions` a read accepts, as a methodology declaration selects them. */
  readonly selectedVersions: readonly NamingSchemaVersion[];
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
  /** The index's numeric segments, compared segment by segment by `compareSpecTreeOrder`. */
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
  readonly ref?: SpecTreeSourceRef;
};

export type SpecTreeNode = {
  readonly id: string;
  readonly kind: SpecTreeContainerKind;
  /** The index's numeric segments, compared segment by segment by `compareSpecTreeOrder`. */
  readonly orderSegments: readonly number[];
  readonly slug: string;
  readonly parentId?: string;
  readonly title?: string;
  readonly ref?: SpecTreeSourceRef;
  readonly state: SpecTreeNodeState;
  readonly decisions: readonly SpecTreeDecision[];
  readonly children: readonly SpecTreeNode[];
  /** The evidence each tagged assertion of the node's spec declares, in order of appearance. */
  readonly evidenceReferences: readonly SpecTreeEvidenceReference[];
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
  readonly kind: SpecTreeContainerKind;
  readonly order: readonly number[];
  readonly slug: string;
  readonly state: SpecTreeNodeState;
  readonly children: readonly SpecTreeProjectedNode[];
};

export type SpecTreeProjectedDecision = {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly order: readonly number[];
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
  readonly orderSegments: readonly number[];
};

const ORDER_COMPARISON_EQUAL = 0;
const SPEC_TREE_UNINDEXED_ORDER_SEGMENTS: readonly number[] = [];
const SPEC_TREE_PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SPEC_TREE_ORDER_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;
const SPEC_TREE_ORDER_SEGMENT_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEGMENT_SEPARATOR;
const SPEC_TREE_ORDER_SEGMENT_RADIX = 10;
const SPEC_TREE_TEXT_ENCODING = "utf8";
const SPEC_TREE_EMPTY_RELATIVE_PATH = "";
const SPEC_TREE_MIN_EVIDENCE_PATH_SEGMENTS = 2;
const EVIDENCE_CORE_BASE_SEGMENT_COUNT = 3;
const EVIDENCE_CORE_RUNNER_SEGMENT_COUNT = 4;
const SPEC_TREE_PARENT_SEGMENT_OFFSET = 2;

export function getKindDefinition<K extends keyof SpecTreeRegistry>(
  kind: K,
  registry: SpecTreeRegistry = KIND_REGISTRY,
): KindDefinition<K> {
  return registry[kind];
}

export function createFilesystemSpecTreeSource(options: FilesystemSpecTreeSourceOptions): SpecTreeSource {
  const registry = options.registry ?? KIND_REGISTRY;
  const includePath = options.includePath ?? includeEverySpecTreePath;
  let selection: Promise<SpecTreeGrammarSelection> | undefined;
  const resolveSelection = (): Promise<SpecTreeGrammarSelection> => {
    selection ??= selectGrammarForSource(options);
    return selection;
  };

  return {
    entries: () => readFilesystemSourceEntries(options.productDir, registry, resolveSelection, includePath),
    async readText(ref: SpecTreeSourceRef): Promise<string> {
      if (ref.path === undefined) {
        throw new Error("Filesystem source refs require a path");
      }
      return readFile(join(options.productDir, ref.path), SPEC_TREE_TEXT_ENCODING);
    },
    linkGrammar: async () => specTreeLinkGrammar(await resolveSelection(), registry),
    grammarSelection: resolveSelection,
  };
}

async function selectGrammarForSource(options: FilesystemSpecTreeSourceOptions): Promise<SpecTreeGrammarSelection> {
  if (options.selection !== undefined) return options.selection;
  return resolveSpecTreeGrammarSelection(options.productDir, options.resolveMethodology);
}

/**
 * The grammar selection of the product at `productDir`: the versions its methodology declaration
 * selects. Throws when the declaration cannot be read or names no version a read accepts.
 */
export async function resolveSpecTreeGrammarSelection(
  productDir: string,
  resolveMethodology: SpecTreeMethodologyResolver = resolveMethodologyConfig,
): Promise<SpecTreeGrammarSelection> {
  const declaration = await resolveMethodology(productDir);
  if (!declaration.ok) throw new Error(declaration.error);
  return selectSpecTreeGrammar(declaration.value);
}

export type CommittedSpecTreeConfigSource = {
  /** The committed paths of the product, which bound the configuration files the declaration is read from. */
  readonly paths: readonly string[];
  /** The committed text of one path, or null when the path is absent. */
  readonly readText: (path: string) => Promise<string | null>;
};

/**
 * The grammar selection of the methodology declaration a committed product tree carries in its
 * product configuration. Throws when the configuration cannot be read, is ambiguous or invalid,
 * or the declaration names no version a read accepts.
 */
export async function resolveCommittedSpecTreeGrammarSelection(
  productDir: string,
  committed: CommittedSpecTreeConfigSource,
): Promise<SpecTreeGrammarSelection> {
  const detected = await detectProductConfigFile(productDir, committed.readText, committed.paths);
  if (!detected.ok) throw new Error(detected.error);
  const declaration = resolveMethodologyConfigFromReadResult(detected.value);
  if (!declaration.ok) throw new Error(declaration.error);
  return selectSpecTreeGrammar(declaration.value);
}

export function recognizeSpecTreeFilesystemEntry(
  record: SpecTreeFilesystemRecord,
  options: SpecTreeRecognitionOptions,
): SpecTreeSourceEntry | null {
  const registry = options.registry ?? KIND_REGISTRY;
  const known = options.schemaVersions;
  const selected = options.selectedVersions;
  const target = canonicalNamingSchemaVersion(selected);
  const name = readLastPathSegment(record.relativePath);

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE && isRootLevelPath(record.relativePath)) {
    const rootEntry = recognizeRootFile(record, name, known, selected);
    if (rootEntry !== null) return rootEntry;
  }

  if (record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY) {
    return recognizeDirectoryRecord(record, name, registry, known, selected);
  }

  if (record.parentId !== undefined && isEvidenceFile(record.relativePath, target)) {
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
  const parsed = parseOrderedSlugByVersions(stripSuffix(name, decisionMatch.definition.suffix), selected);
  if (parsed === null) return null;
  return {
    type: SPEC_TREE_ENTRY_TYPE.DECISION,
    kind: decisionMatch.kind as DecisionKind,
    id: record.relativePath,
    orderSegments: parsed.orderSegments,
    slug: parsed.slug,
    parentId: record.parentId,
    ref: sourceRefForRelativePath(record.relativePath),
  };
}

/** The verdicts of the skill-conformance oracle: a path a skill operation produces, or one no recognized form covers. */
export const SPEC_TREE_CONFORMANCE_VERDICT = {
  VALID: "valid",
  FOREIGN: "foreign",
} as const;

export type SpecTreeConformanceVerdict =
  (typeof SPEC_TREE_CONFORMANCE_VERDICT)[keyof typeof SPEC_TREE_CONFORMANCE_VERDICT];

/** Where a classified record sits: the ancestry context that decides which forms can contain it. */
export const SPEC_TREE_CONFORMANCE_LOCATION = {
  PRODUCT_ROOT: "tree-root",
  NODE_DIRECTORY: "node-directory",
  EVIDENCE_DIRECTORY: "evidence-directory",
  EVAL_LANE: "eval-lane",
  KNOWLEDGE_ROOT: "knowledge-root",
  PROBE_DIRECTORY: "probe-directory",
} as const;

export type SpecTreeConformanceLocation =
  (typeof SPEC_TREE_CONFORMANCE_LOCATION)[keyof typeof SPEC_TREE_CONFORMANCE_LOCATION];

type SpecTreeConformanceContextBase = {
  /** The slug of the node directory that holds the record. */
  readonly parentSlug?: string | undefined;
};

/** The kind of the node directory that holds the record; the probe lane is decided by it. */
type SpecTreeConformanceParentKind = Kind | ProductKind;

type SpecTreeKindedConformanceLocation =
  | typeof SPEC_TREE_CONFORMANCE_LOCATION.NODE_DIRECTORY
  | typeof SPEC_TREE_CONFORMANCE_LOCATION.PROBE_DIRECTORY;

export type SpecTreeConformanceContext =
  | (SpecTreeConformanceContextBase & {
    readonly location: SpecTreeKindedConformanceLocation;
    readonly parentKind: SpecTreeConformanceParentKind;
    readonly holder?: undefined;
  })
  | (SpecTreeConformanceContextBase & {
    readonly location: Exclude<SpecTreeConformanceLocation, SpecTreeKindedConformanceLocation>;
    readonly parentKind?: undefined;
    /** The directory that holds a knowledge root; a node directory when absent. */
    readonly holder?: SpecTreeKnowledgeRootHolder | undefined;
  });

const OWNED_RECOGNITION_OPTIONS: SpecTreeRecognitionOptions = {
  schemaVersions: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  selectedVersions: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
};

const EVAL_RULE_DIRECTORY_SEGMENT_COUNT = 2;
const PROBE_RUNS_DESCENDANT_MIN_SEGMENT_COUNT = 4;
const PROBE_RUNS_SEGMENT_INDEX = 2;
const PROBE_SLUG_SEGMENT_INDEX = 1;

/**
 * Classifies one path inside `spx/` as valid, a form a skill operation produces, or foreign, a path
 * no recognized form covers. Every form derives from the grammar of the naming-schema versions the
 * options select; product, node, decision, and evidence forms compose the entry recognizer.
 */
export function classifySpecTreePath(
  record: SpecTreeFilesystemRecord,
  context: SpecTreeConformanceContext,
  options: SpecTreeRecognitionOptions = OWNED_RECOGNITION_OPTIONS,
): SpecTreeConformanceVerdict {
  return conformsToGrammar(record, context, options)
    ? SPEC_TREE_CONFORMANCE_VERDICT.VALID
    : SPEC_TREE_CONFORMANCE_VERDICT.FOREIGN;
}

function conformsToGrammar(
  record: SpecTreeFilesystemRecord,
  context: SpecTreeConformanceContext,
  options: SpecTreeRecognitionOptions,
): boolean {
  const location = SPEC_TREE_CONFORMANCE_LOCATION;
  switch (context.location) {
    case location.PRODUCT_ROOT:
      return conformsAtProductRoot(record, options);
    case location.NODE_DIRECTORY:
      return conformsInNodeDirectory(record, context, options);
    case location.EVIDENCE_DIRECTORY:
      return recognizedEntryTypes(record, options, [SPEC_TREE_ENTRY_TYPE.EVIDENCE]);
    case location.EVAL_LANE:
      return conformsInEvalLane(record, options);
    case location.KNOWLEDGE_ROOT:
      return conformsInKnowledgeRoot(
        record,
        context.holder ?? SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.NODE_DIRECTORY,
        options,
      );
    case location.PROBE_DIRECTORY:
      return conformsInProbeDirectory(record, context.parentKind, options);
  }
}

function recognizedEntryTypes(
  record: SpecTreeFilesystemRecord,
  options: SpecTreeRecognitionOptions,
  types: readonly string[],
): boolean {
  try {
    const entry = recognizeSpecTreeFilesystemEntry(record, options);
    return entry !== null && types.includes(entry.type);
  } catch {
    return false;
  }
}

function isFileRecord(record: SpecTreeFilesystemRecord): boolean {
  return record.type === SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE;
}

function entryKindOfRecord(record: SpecTreeFilesystemRecord) {
  return isFileRecord(record) ? SPEC_TREE_EVAL_ENTRY_KIND.FILE : SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY;
}

function acceptsNote(record: SpecTreeFilesystemRecord, options: SpecTreeRecognitionOptions): boolean {
  return isFileRecord(record)
    && options.selectedVersions.some((version) => acceptsNodeLocalNote(version, record.relativePath));
}

function conformsAtProductRoot(record: SpecTreeFilesystemRecord, options: SpecTreeRecognitionOptions): boolean {
  if (isFileRecord(record) && record.relativePath === SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME) return true;
  if (acceptsNote(record, options)) return true;
  if (conformsInKnowledgeRoot(record, SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.ROOT_PRODUCT, options)) return true;
  return recognizedEntryTypes(record, options, [
    SPEC_TREE_ENTRY_TYPE.PRODUCT,
    SPEC_TREE_ENTRY_TYPE.NODE,
    SPEC_TREE_ENTRY_TYPE.DECISION,
  ]);
}

function isSpecFileName(name: string, parentSlug: string | undefined, options: SpecTreeRecognitionOptions): boolean {
  const selection = { known: options.schemaVersions, selected: options.selectedVersions };
  const versions = [...options.selectedVersions, ...priorNamingSchemaVersions(selection)];
  return versions.some((version) => {
    if (!name.endsWith(version.specFileSuffix)) return false;
    const stem = stripSuffix(name, version.specFileSuffix);
    if (stem === "") return false;
    return version.specFileSuffix === SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX ? stem === parentSlug : true;
  });
}

function admitsProbeLane(parentKind: SpecTreeConformanceParentKind): boolean {
  return (OUTPUT_KINDS as readonly string[]).includes(parentKind);
}

function conformsInNodeDirectory(
  record: SpecTreeFilesystemRecord,
  context: SpecTreeConformanceContext & { readonly parentKind: SpecTreeConformanceParentKind },
  options: SpecTreeRecognitionOptions,
): boolean {
  if (isFileRecord(record)) {
    return isSpecFileName(record.relativePath, context.parentSlug, options)
      || acceptsNote(record, options)
      || recognizedEntryTypes(record, options, [SPEC_TREE_ENTRY_TYPE.DECISION]);
  }
  const name = record.relativePath;
  if (
    options.selectedVersions.some((version) =>
      name === version.eval.DIRECTORY_NAME || name === version.evidence.DIRECTORY_NAME
    )
  ) return true;
  if (conformsInKnowledgeRoot(record, SPEC_TREE_KNOWLEDGE_ROOT_HOLDER.NODE_DIRECTORY, options)) return true;
  if (conformsInProbeDirectory(record, context.parentKind, options)) return true;
  return recognizedEntryTypes(record, options, [SPEC_TREE_ENTRY_TYPE.NODE]);
}

function conformsInEvalLane(record: SpecTreeFilesystemRecord, options: SpecTreeRecognitionOptions): boolean {
  const entryKind = entryKindOfRecord(record);
  return options.selectedVersions.some((version) => {
    if (acceptsEvalLaneEntry(version, record.relativePath, entryKind)) return true;
    const segments = record.relativePath.split(version.pathSeparator);
    const [directory, ruleSlug = ""] = segments;
    return entryKind === SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY
      && segments.length === EVAL_RULE_DIRECTORY_SEGMENT_COUNT
      && directory === version.eval.DIRECTORY_NAME
      && ruleSlug !== "";
  });
}

function conformsInKnowledgeRoot(
  record: SpecTreeFilesystemRecord,
  holder: SpecTreeKnowledgeRootHolder,
  options: SpecTreeRecognitionOptions,
): boolean {
  const entryKind = entryKindOfRecord(record);
  return options.selectedVersions.some((version) =>
    acceptsKnowledgeRoot(version, holder, record.relativePath, entryKind)
  );
}

function conformsInProbeDirectory(
  record: SpecTreeFilesystemRecord,
  parentKind: SpecTreeConformanceParentKind,
  options: SpecTreeRecognitionOptions,
): boolean {
  if (!admitsProbeLane(parentKind)) return false;
  const entryKind = entryKindOfRecord(record);
  return options.selectedVersions.some((version) => {
    if (acceptsProbeEntry(version, record.relativePath, entryKind)) return true;
    if (version.probe === undefined) return false;
    const segments = record.relativePath.split(version.pathSeparator);
    return segments.length >= PROBE_RUNS_DESCENDANT_MIN_SEGMENT_COUNT
      && segments[0] === version.probe.DIRECTORY_NAME
      && segments[PROBE_RUNS_SEGMENT_INDEX] === version.probe.RUNS_DIRECTORY_NAME
      && acceptsProbeEntry(
        version,
        segments.slice(0, PROBE_RUNS_SEGMENT_INDEX).join(version.pathSeparator),
        SPEC_TREE_EVAL_ENTRY_KIND.DIRECTORY,
      )
      && segments.slice(PROBE_RUNS_SEGMENT_INDEX + 1).every((segment) => segment !== "")
      && segments[PROBE_SLUG_SEGMENT_INDEX] !== "";
  });
}

/** Whether a selected version reads its root spec from the file's front matter rather than from its name alone. */
function rootSpecFileNeedsKind(version: NamingSchemaVersion, name: string): boolean {
  return version.rootSpecKind !== undefined && name.endsWith(version.productSuffix);
}

function recognizeRootFile(
  record: SpecTreeFilesystemRecord,
  name: string,
  known: readonly NamingSchemaVersion[],
  selected: readonly NamingSchemaVersion[],
): SpecTreeSourceEntry | null {
  for (const version of selected) {
    if (!name.endsWith(version.productSuffix)) continue;
    if (version.rootSpecKind !== undefined && record.declaredKind !== version.rootSpecKind) {
      throw new Error(
        `${
          sourceRefForRelativePath(record.relativePath).id
        } must declare kind: ${version.rootSpecKind} in its front matter`,
      );
    }
    return {
      type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
      id: record.relativePath,
      title: stripSuffix(name, version.productSuffix),
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  const prior = priorNamingSchemaVersions({ known, selected }).find(
    (version) => version.rootSpecKind === undefined && name.endsWith(version.productSuffix),
  );
  if (prior === undefined) return null;
  return {
    type: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
    id: record.relativePath,
    version: prior.version,
    orderSegments: SPEC_TREE_UNINDEXED_ORDER_SEGMENTS,
    parentId: record.parentId,
    ref: sourceRefForRelativePath(record.relativePath),
  };
}

function recognizeDirectoryRecord(
  record: SpecTreeFilesystemRecord,
  name: string,
  registry: SpecTreeRegistry,
  known: readonly NamingSchemaVersion[],
  selected: readonly NamingSchemaVersion[],
): SpecTreeSourceEntry | null {
  const selectedMatch = matchNodeSuffixFromVersions(name, selected);
  if (selectedMatch !== null) {
    const kind = nodeKindForSuffix(selectedMatch.suffix, registry);
    if (kind !== null) {
      return {
        type: SPEC_TREE_ENTRY_TYPE.NODE,
        kind,
        id: record.relativePath,
        orderSegments: selectedMatch.parsed.orderSegments,
        slug: selectedMatch.parsed.slug,
        parentId: record.parentId,
        ref: sourceRefForNode(record.relativePath, selectedMatch.parsed.slug, selectedMatch.version),
      };
    }
  }

  const supersededMatch = matchSupersededNodeVersion(name, known, selected);
  if (supersededMatch !== null) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
      id: record.relativePath,
      version: supersededMatch.version,
      orderSegments: supersededMatch.orderSegments,
      parentId: record.parentId,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  if (matchKindSuffix(name, registry, SPEC_TREE_KIND_CATEGORY.DECISION) !== null) return null;

  // An ordered-form attempt: parseOrderedSlug folds the unrecognized suffix into the
  // slug component (it splits on the first separator and accepts any non-empty slug),
  // so a `{NN}-{slug}{unknown-suffix}` directory parses here and is retained as invalid
  // rather than dropped.
  const invalidParsed = parseOrderedSlugByVersions(name, known);
  if (invalidParsed !== null) {
    return {
      type: SPEC_TREE_ENTRY_TYPE.INVALID,
      id: record.relativePath,
      orderSegments: invalidParsed.orderSegments,
      parentId: record.parentId,
      ref: sourceRefForRelativePath(record.relativePath),
    };
  }

  return null;
}

type NodeSuffixMatch = {
  readonly suffix: string;
  readonly parsed: OrderedSlug;
  readonly version: NamingSchemaVersion;
};

function matchNodeSuffixFromVersions(
  name: string,
  versions: readonly NamingSchemaVersion[],
): NodeSuffixMatch | null {
  for (const version of versions) {
    for (const suffix of version.nodeSuffixes) {
      if (!name.endsWith(suffix)) continue;
      const parsed = parseOrderedSlug(stripSuffix(name, suffix), version.order.PATTERN);
      if (parsed !== null) {
        return { suffix, parsed, version };
      }
    }
  }
  return null;
}

/** The registered kind a directory of the era before 3.0 classifies as when a selected version accepts its suffix. */
const PRIOR_NODE_KIND: SpecTreeNodeKind = "capability";
const PRIOR_NODE_SUFFIXES: readonly string[] = SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES;

function nodeKindForSuffix(suffix: string, registry: SpecTreeRegistry): SpecTreeContainerKind | null {
  if (suffix === SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX) return SPEC_TREE_CONFIG.PRODUCT.KIND;
  if (PRIOR_NODE_SUFFIXES.includes(suffix)) return PRIOR_NODE_KIND;
  for (const [kind, definition] of Object.entries(registry) as Array<[Kind, KindDefinition<Kind>]>) {
    if (isNodeCategory(definition.category) && definition.suffix === suffix) {
      return kind as SpecTreeNodeKind;
    }
  }
  return null;
}

function isNodeCategory(category: SpecTreeKindCategory): boolean {
  return category === SPEC_TREE_KIND_CATEGORY.NODE || category === SPEC_TREE_KIND_CATEGORY.OUTPUT;
}

function matchSupersededNodeVersion(
  name: string,
  known: readonly NamingSchemaVersion[],
  selected: readonly NamingSchemaVersion[],
): { readonly version: string; readonly orderSegments: readonly number[] } | null {
  const selectedSuffixes = new Set(selected.flatMap((version) => version.nodeSuffixes));

  for (const version of priorNamingSchemaVersions({ known, selected })) {
    for (const suffix of version.nodeSuffixes) {
      if (selectedSuffixes.has(suffix)) continue;
      if (!name.endsWith(suffix)) continue;
      const parsed = parseOrderedSlug(stripSuffix(name, suffix), version.order.PATTERN);
      if (parsed !== null) return { version: version.version, orderSegments: parsed.orderSegments };
    }
  }
  return null;
}

const linkGrammarBySelection = new WeakMap<SpecTreeGrammarSelection, SpecTreeLinkGrammar>();

const KNOWN_GRAMMAR_SELECTION: SpecTreeGrammarSelection = {
  known: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  selected: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
};

/**
 * The spec-tree link grammar of a product's grammar selection: a link target is judged by the
 * node-directory and decision forms the selected versions accept, and by the forms of the
 * versions ordered before the declared target, which a migrating tree still carries.
 */
export function specTreeLinkGrammar(
  selection: SpecTreeGrammarSelection,
  registry?: SpecTreeRegistry,
): SpecTreeLinkGrammar {
  const cached = registry === undefined ? linkGrammarBySelection.get(selection) : undefined;
  if (cached !== undefined) return cached;
  const recognition: SpecTreeRecognitionOptions = {
    registry,
    schemaVersions: selection.known,
    selectedVersions: selection.selected,
  };
  const grammar = createSpecTreeLinkGrammar({
    isNodeDirectoryName: (directoryName) => {
      const entry = recognizeSpecTreeFilesystemEntry({
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
        relativePath: directoryName,
      }, recognition);
      return entry?.type === SPEC_TREE_ENTRY_TYPE.NODE || entry?.type === SPEC_TREE_ENTRY_TYPE.SUPERSEDED;
    },
    isDecisionFile: (specTreeRelativePath) =>
      recognizeSpecTreeFilesystemEntry({
        type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
        relativePath: specTreeRelativePath,
      }, recognition)?.type === SPEC_TREE_ENTRY_TYPE.DECISION,
  });
  if (registry === undefined) linkGrammarBySelection.set(selection, grammar);
  return grammar;
}

export async function readSpecTree(options: SpecTreeOptions): Promise<SpecTreeSnapshot> {
  const entries = await collectSourceEntries(options.source);
  const products = entries.filter(isProductEntry);
  if (products.length > 1) {
    throw new Error(
      `A spec tree holds one root spec; found ${products.length}: ${
        products.map((entry) => entry.ref?.path ?? entry.id).join(", ")
      }`,
    );
  }
  const product = products.at(0) ?? null;
  const superseded = entries.filter(isSupersededEntry);
  const residual = entries.filter(isInvalidEntry);
  const evidenceByParent = groupEvidence(entries.filter(isEvidenceEntry));
  const decisions = entries.filter(isDecisionEntry).map(toDecision).sort(compareOrderedEntries);
  const decisionsByParent = groupDecisions(decisions);
  const nodesById = new Map<string, MutableSpecTreeNode>();

  const nodeEntries = entries.filter(isNodeEntry);
  const linkGrammar = await options.source.linkGrammar?.() ?? specTreeLinkGrammar(KNOWN_GRAMMAR_SELECTION);
  const nodeEvidenceReferences = await Promise.all(
    nodeEntries.map((entry) => readNodeEvidenceReferences(entry, options.source, linkGrammar)),
  );
  for (const [index, entry] of nodeEntries.entries()) {
    const state = deriveState(entry, evidenceByParent.get(entry.id) ?? [], options.evidence);
    nodesById.set(entry.id, {
      id: entry.id,
      kind: entry.kind,
      orderSegments: entry.orderSegments,
      slug: entry.slug,
      parentId: entry.parentId,
      title: entry.title,
      ref: entry.ref,
      state,
      decisions: decisionsByParent.get(entry.id) ?? [],
      children: [],
      evidenceReferences: nodeEvidenceReferences[index] ?? [],
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

  const grammarSelection = await options.source.grammarSelection?.() ?? KNOWN_GRAMMAR_SELECTION;
  assertKindContainment(nodesById, grammarSelection.selected);

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

function suffixOfContainerKind(kind: SpecTreeContainerKind): string {
  return kind === SPEC_TREE_CONFIG.PRODUCT.KIND ? SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX : KIND_REGISTRY[kind].suffix;
}

function acceptedTogether(
  versions: readonly NamingSchemaVersion[],
  left: SpecTreeContainerKind,
  right: SpecTreeContainerKind,
): boolean {
  const suffixes = [suffixOfContainerKind(left), suffixOfContainerKind(right)];
  return versions.some((version) => suffixes.every((suffix) => version.nodeSuffixes.includes(suffix)));
}

/**
 * Fails when a node's kind is not among the kinds its parent's kind admits. A pair no single
 * selected naming-schema version accepts is never judged, so a migrating tree assembles a
 * kind of one version under a kind of another. The failure names every violating child and parent.
 */
function assertKindContainment(
  nodesById: ReadonlyMap<string, MutableSpecTreeNode>,
  selected: readonly NamingSchemaVersion[],
): void {
  const violations: string[] = [];
  for (const node of nodesById.values()) {
    const parent = node.parentId === undefined ? undefined : nodesById.get(node.parentId);
    if (parent === undefined) continue;
    const grandparent = parent.parentId === undefined ? undefined : nodesById.get(parent.parentId);
    const grandparentKind = grandparent?.kind === SPEC_TREE_CONFIG.PRODUCT.KIND ? undefined : grandparent?.kind;
    const admitted = resolveAdmittedChildren(parent.kind, grandparentKind);
    if (admitted === undefined || admitted.includes(node.kind)) continue;
    if (!acceptedTogether(selected, parent.kind, node.kind)) continue;
    violations.push(
      `${node.id} (${node.kind}) under ${parent.id} (${parent.kind}): a ${parent.kind} admits ${admitted.join(", ")}`,
    );
  }
  if (violations.length > 0) {
    throw new Error(`Spec tree nodes nest a kind their parent's kind does not admit: ${violations.join("; ")}`);
  }
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
      order: projectedOrder(decision.orderSegments),
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
    orderSegments: entry.orderSegments,
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

async function readNodeEvidenceReferences(
  entry: SpecTreeNodeSourceEntry,
  source: SpecTreeSource,
  linkGrammar: SpecTreeLinkGrammar,
): Promise<readonly SpecTreeEvidenceReference[]> {
  const specRef = entry.ref;
  const specPath = specRef?.path;
  if (source.readText === undefined || specRef === undefined || specPath === undefined) return [];
  const readText = source.readText.bind(source);
  const specText = await readText(specRef).catch((error: unknown) => {
    if (isFileNotFound(error)) return null;
    throw error;
  });
  if (specText === null) return [];
  return readSpecEvidenceReferences(
    specPath,
    specText,
    linkGrammar,
    (path) => readText({ id: path, path }),
  );
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

/** The projection contract's `order` field: the index's segments, which `compareSpecTreeOrder` compares. */
function projectedOrder(orderSegments: readonly number[]): readonly number[] {
  return [...orderSegments];
}

function projectNode(node: SpecTreeNode): SpecTreeProjectedNode {
  return {
    id: node.id,
    kind: node.kind,
    order: projectedOrder(node.orderSegments),
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
  const orderComparison = compareSpecTreeOrder(left.orderSegments, right.orderSegments);
  if (orderComparison !== ORDER_COMPARISON_EQUAL) return orderComparison;
  return compareSpecContextOrdinal(left.id, right.id);
}

async function* readFilesystemSourceEntries(
  productDir: string,
  registry: SpecTreeRegistry,
  resolveSelection: () => Promise<SpecTreeGrammarSelection>,
  includePath: SpecTreePathInclusionPredicate,
): AsyncIterable<SpecTreeSourceEntry> {
  const selection = await resolveSelection();
  yield* walkFilesystemDirectory({
    absolutePath: join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY),
    relativePath: SPEC_TREE_EMPTY_RELATIVE_PATH,
    registry,
    selection,
    includePath,
  });
}

type FilesystemWalkContext = {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly registry: SpecTreeRegistry;
  readonly selection: SpecTreeGrammarSelection;
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

  const sortedEntries = [...entries].sort((left, right) => compareSpecContextOrdinal(left.name, right.name));
  for (const entry of sortedEntries) {
    const relativePath = joinSpecTreePath(context.relativePath, entry.name);
    const refPath = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
    if (!await context.includePath(refPath)) continue;

    const recordType = filesystemRecordType(entry);
    if (recordType === undefined) continue;

    const declaredKind = entry.isFile()
      ? await readSpecTreeDeclaredRootKind({
        relativePath,
        selection: context.selection,
        readText: () => readFile(join(context.absolutePath, entry.name), SPEC_TREE_TEXT_ENCODING),
      })
      : undefined;
    const sourceEntry = recognizeSpecTreeFilesystemEntry(
      { type: recordType, relativePath, parentId: context.parentId, declaredKind },
      {
        registry: context.registry,
        schemaVersions: context.selection.known,
        selectedVersions: context.selection.selected,
      },
    );
    if (sourceEntry !== null) yield sourceEntry;

    if (entry.isDirectory() && shouldDescendIntoDirectory(sourceEntry)) {
      yield* walkFilesystemDirectory({
        absolutePath: join(context.absolutePath, entry.name),
        relativePath,
        registry: context.registry,
        selection: context.selection,
        includePath: context.includePath,
        parentId: childParentId(context, sourceEntry),
      });
    }
  }
}

/** The fence that opens and closes a root spec's front matter. */
export const SPEC_TREE_FRONT_MATTER_FENCE = "---";
/** The front-matter key carrying a root spec's identity. */
export const SPEC_TREE_FRONT_MATTER_ID_KEY = "id";
/** The front-matter key carrying a root spec's declared kind. */
export const SPEC_TREE_FRONT_MATTER_KIND_KEY = "kind";

const FRONT_MATTER_PATTERN = new RegExp(
  String.raw`^${SPEC_TREE_FRONT_MATTER_FENCE}\r?\n([\s\S]*?)\r?\n${SPEC_TREE_FRONT_MATTER_FENCE}(?:\r?\n|$)`,
);

/** The fields a root spec's front matter carries. */
export type SpecTreeRootFrontMatterFields = {
  readonly id?: string;
};

/**
 * Renders a root spec's front matter, fence to fence and ending in a line break, in the format
 * `readSpecTreeDeclaredRootKind` reads.
 */
export function renderSpecTreeRootFrontMatter(fields: SpecTreeRootFrontMatterFields = {}): string {
  const lines = [
    SPEC_TREE_FRONT_MATTER_FENCE,
    ...(fields.id === undefined ? [] : [`${SPEC_TREE_FRONT_MATTER_ID_KEY}: ${fields.id}`]),
    `${SPEC_TREE_FRONT_MATTER_KIND_KEY}: ${SPEC_TREE_CONFIG.PRODUCT.KIND}`,
    SPEC_TREE_FRONT_MATTER_FENCE,
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * The `kind` a root spec file declares in its front matter, read only for a file a selected version
 * reads as the root spec. The caller supplies the text of the file it holds, so every source of
 * records reads the declaration the same way.
 */
export async function readSpecTreeDeclaredRootKind(input: {
  readonly relativePath: string;
  readonly selection: SpecTreeGrammarSelection;
  readonly readText: () => Promise<string>;
}): Promise<string | undefined> {
  if (!isRootLevelPath(input.relativePath)) return undefined;
  const name = readLastPathSegment(input.relativePath);
  if (!input.selection.selected.some((version) => rootSpecFileNeedsKind(version, name))) return undefined;

  const frontMatter = FRONT_MATTER_PATTERN.exec(await input.readText());
  if (frontMatter === null) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(frontMatter[1]);
  } catch {
    // Malformed front matter declares no kind; the caller's diagnostic names the file.
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const kind = (parsed as Record<string, unknown>)[SPEC_TREE_FRONT_MATTER_KIND_KEY];
  return typeof kind === "string" ? kind : undefined;
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
  readonly orderSegments: readonly number[];
  readonly slug: string;
};

function parseOrderedSlugByVersions(
  value: string,
  versions: readonly NamingSchemaVersion[],
): OrderedSlug | null {
  for (const version of versions) {
    const parsed = parseOrderedSlug(value, version.order.PATTERN);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseOrderedSlug(value: string, orderPattern: RegExp): OrderedSlug | null {
  const separatorIndex = value.indexOf(SPEC_TREE_ORDER_SEPARATOR);
  if (separatorIndex <= ORDER_COMPARISON_EQUAL) return null;
  const orderText = value.slice(0, separatorIndex);
  if (!orderPattern.test(orderText)) return null;
  const slug = value.slice(separatorIndex + SPEC_TREE_ORDER_SEPARATOR.length);
  if (slug.length === 0) return null;
  return {
    orderSegments: orderText.split(SPEC_TREE_ORDER_SEGMENT_SEPARATOR).map((segment) =>
      Number.parseInt(segment, SPEC_TREE_ORDER_SEGMENT_RADIX)
    ),
    slug,
  };
}

function isRootLevelPath(relativePath: string): boolean {
  return !relativePath.includes(SPEC_TREE_PATH_SEPARATOR);
}

function isEvidenceFile(relativePath: string, version: NamingSchemaVersion): boolean {
  const segments = relativePath.split(version.pathSeparator);
  if (segments.length < SPEC_TREE_MIN_EVIDENCE_PATH_SEGMENTS) return false;

  const filename = segments.at(-1) ?? "";
  const directoryName = segments.at(-SPEC_TREE_PARENT_SEGMENT_OFFSET);
  return directoryName === version.evidence.DIRECTORY_NAME && isTestFileName(filename, version.evidence);
}

function isEvidenceWord(text: string, evidence: SpecTreeEvidenceGrammar): boolean {
  return evidence.WORD_PATTERN.test(text);
}

function isEvidenceSlug(text: string, evidence: SpecTreeEvidenceGrammar): boolean {
  return text.split(evidence.WORD_SEPARATOR).every((word) => isEvidenceWord(word, evidence));
}

function isEvidenceCore(core: string, evidence: SpecTreeEvidenceGrammar): boolean {
  const segments = core.split(evidence.SEGMENT_SEPARATOR);
  if (segments.length < EVIDENCE_CORE_BASE_SEGMENT_COUNT || segments.length > EVIDENCE_CORE_RUNNER_SEGMENT_COUNT) {
    return false;
  }
  const [subject, mode, level, runner] = segments as [string, string, string, string | undefined];
  return isEvidenceSlug(subject, evidence)
    && evidence.MODES.includes(mode)
    && evidence.LEVELS.includes(level)
    && (runner === undefined || isEvidenceSlug(runner, evidence));
}

function splitAtLastSegmentSeparator(
  text: string,
  evidence: SpecTreeEvidenceGrammar,
): { readonly head: string; readonly tail: string } | null {
  const index = text.lastIndexOf(evidence.SEGMENT_SEPARATOR);
  if (index <= ORDER_COMPARISON_EQUAL) return null;
  return { head: text.slice(0, index), tail: text.slice(index + evidence.SEGMENT_SEPARATOR.length) };
}

function isTestFileName(filename: string, evidence: SpecTreeEvidenceGrammar): boolean {
  const extension = splitAtLastSegmentSeparator(filename, evidence);
  if (extension === null || !isEvidenceWord(extension.tail, evidence)) return false;

  const prefix = `${evidence.TEST_MARKER}${evidence.AFFIX_SEPARATOR}`;
  const suffix = `${evidence.AFFIX_SEPARATOR}${evidence.TEST_MARKER}`;
  const infix = splitAtLastSegmentSeparator(extension.head, evidence);
  if (infix !== null && infix.tail === evidence.TEST_MARKER && isEvidenceCore(infix.head, evidence)) return true;
  if (extension.head.startsWith(prefix) && isEvidenceCore(extension.head.slice(prefix.length), evidence)) return true;
  return extension.head.endsWith(suffix)
    && isEvidenceCore(extension.head.slice(0, extension.head.length - suffix.length), evidence);
}

function shouldDescendIntoDirectory(sourceEntry: SpecTreeSourceEntry | null): boolean {
  return sourceEntry === null || sourceEntry.type === SPEC_TREE_ENTRY_TYPE.NODE;
}

function sourceRefForRelativePath(relativePath: string): SpecTreeSourceRef {
  const path = joinSpecTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, relativePath);
  return { id: path, path };
}

function sourceRefForNode(relativePath: string, slug: string, version: NamingSchemaVersion): SpecTreeSourceRef {
  return sourceRefForRelativePath(joinSpecTreePath(relativePath, `${slug}${version.specFileSuffix}`));
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
