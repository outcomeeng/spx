import { posix } from "node:path";

import MarkdownIt from "markdown-it";
import { parseDocument, stringify } from "yaml";

import { type NodeKind, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "./config";
import {
  compareSpecContextOrdinal,
  SPEC_CONTEXT_MODE,
  SPEC_CONTEXT_SELECTION_REASON,
  type SpecContextMode,
  specContextReasonsMode,
  type SpecContextSelectionReason,
  type SpecContextTargetSelection,
} from "./context-manifest";
import { specContextAncestors, specContextDecisions, specContextSiblings } from "./context-read-set";
import type { SpecContextTarget } from "./context-target";
import type { SpecTreeDecision, SpecTreeNode, SpecTreeSnapshot } from "./index";

/**
 * The paragraph a Digest selects: an output node's opening, keyed by its
 * kind's resolved opening keyword, or a decision's decision statement.
 */
export const SPEC_CONTEXT_DIGEST_SOURCE = {
  OPENING: "opening",
  DECISION_STATEMENT: "decision-statement",
} as const;

export type SpecContextDigest =
  | {
    readonly source: typeof SPEC_CONTEXT_DIGEST_SOURCE.OPENING;
    readonly kind: string;
    readonly keyword: string | undefined;
  }
  | { readonly source: typeof SPEC_CONTEXT_DIGEST_SOURCE.DECISION_STATEMENT };

/**
 * The kind registry a projection is given: the opening each configured output
 * node kind resolves, if any. A kind the registry omits, or one it declares
 * without an opening, resolves no opening and cannot supply a Digest.
 */
export type SpecContextKindRegistry = {
  readonly [K in NodeKind]?: { readonly opening?: string };
};

/** The ways a document's required Digest paragraph fails to resolve, each failing the whole projection. */
export const SPEC_CONTEXT_PROJECTION_FAILURE_KIND = {
  NO_DIGEST: "no-digest",
  MISSING_DECISION_STATEMENT: "missing-decision-statement",
  UNRESOLVED_KIND_OPENING: "unresolved-kind-opening",
  MISSING_OPENING: "missing-opening",
} as const;

export type SpecContextProjectionFailureKind =
  (typeof SPEC_CONTEXT_PROJECTION_FAILURE_KIND)[keyof typeof SPEC_CONTEXT_PROJECTION_FAILURE_KIND];

/** A projection failure naming its kind and the document whose Digest could not be resolved. */
export class SpecContextProjectionError extends Error {
  constructor(
    readonly kind: SpecContextProjectionFailureKind,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "SpecContextProjectionError";
  }
}

const DECISION_STATEMENT_DIGEST: SpecContextDigest = { source: SPEC_CONTEXT_DIGEST_SOURCE.DECISION_STATEMENT };

/** The node-local artifacts a projection selects only when present: the issue note, the knowledge index, the outcome record. */
export const SPEC_CONTEXT_OPTIONAL_ARTIFACT = {
  ISSUES: SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES,
  KNOWLEDGE_INDEX: "knowledge/index.md",
  OUTCOME_SUFFIX: ".outcome.md",
} as const;

const DISCOVERY_DEPTH = 2;
const ISSUE_FILENAME = SPEC_CONTEXT_OPTIONAL_ARTIFACT.ISSUES;
const KNOWLEDGE_INDEX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX;
const OUTCOME_SUFFIX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX;
/** The text frames of the two entry classes: an element per document, a self-closing element per reference. */
export const SPEC_CONTEXT_FRAME = { DOCUMENT: "spx-document", REFERENCE: "spx-reference" } as const;

/**
 * The text grammar around framed entries: tag delimiters, the path attribute,
 * the front-matter fence around selected metadata, the line break, and the one
 * blank line between consecutive entries.
 */
export const SPEC_CONTEXT_FRAME_SYNTAX = {
  OPEN_TAG_START: "<",
  CLOSE_TAG_START: "</",
  PATH_ATTRIBUTE_START: " path=\"",
  OPEN_TAG_END: "\">",
  SELF_CLOSING_TAG_END: "\" />",
  CLOSE_TAG_END: ">",
  FRONT_MATTER_FENCE: "---",
  LINE_BREAK: "\n",
  ENTRY_SEPARATOR: "\n\n",
} as const;

/** The one front-matter key an output node's projection selects. */
export const SPEC_CONTEXT_SELECTED_METADATA_KEY = "malleability";

const MALLEABILITY_KEY = SPEC_CONTEXT_SELECTED_METADATA_KEY;
const inlineCitationParser = new MarkdownIt().disable("reference");

export interface SpecContextSelection {
  readonly path: string;
  readonly mode: SpecContextMode;
  /** Every target-reason pair through which a targeted selection selects this entry; empty for targetless discovery. */
  readonly reasons: readonly SpecContextTargetSelection[];
  /** The paragraph a Digest of this entry selects; a product document carries none, being projected Full. */
  readonly digest?: SpecContextDigest;
  readonly outputNode?: boolean;
  readonly scanCitations?: boolean;
  readonly optional?: boolean;
}

/** The two entry kinds of a `show` projection: a document carries selected content, a reference only its path. */
export const SPEC_CONTEXT_ENTRY_TYPE = {
  DOCUMENT: "document",
  REFERENCE: "reference",
} as const;

export type SpecContextEntry =
  | { readonly type: typeof SPEC_CONTEXT_ENTRY_TYPE.REFERENCE; readonly path: string }
  | {
    readonly type: typeof SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT;
    readonly path: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly content: string;
  };

export type SpecContextDocumentEntry = Extract<
  SpecContextEntry,
  { readonly type: typeof SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT }
>;

export interface SpecContextProjectedEntry {
  readonly selection: SpecContextSelection;
  readonly entry: SpecContextEntry;
}

function nodeDirectory(node: SpecTreeNode): string {
  return `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${node.id}`;
}

function requiredDocumentPath(path: string | undefined, owner: string): string {
  if (path === undefined) throw new Error(`No spec document for ${owner}`);
  return path;
}

/** The opening keyword the given kind registry resolves for a node's kind, or none when it resolves none. */
function resolvedKindOpening(node: SpecTreeNode, registry: SpecContextKindRegistry): string | undefined {
  return registry[node.kind]?.opening;
}

/**
 * A node's spec selection, or none when no selectable path holds the spec: a
 * node directory without its spec file still structures the walk, but
 * contributes no spec entry.
 */
function nodeSelection(
  node: SpecTreeNode,
  mode: SpecContextMode,
  reasons: readonly SpecContextTargetSelection[],
  existingPaths: ReadonlySet<string>,
  registry: SpecContextKindRegistry,
): readonly SpecContextSelection[] {
  const path = node.ref?.path;
  if (path === undefined || !existingPaths.has(path)) return [];
  return [{
    path,
    mode,
    reasons,
    digest: {
      source: SPEC_CONTEXT_DIGEST_SOURCE.OPENING,
      kind: node.kind,
      keyword: resolvedKindOpening(node, registry),
    },
    outputNode: true,
    scanCitations: true,
  }];
}

/**
 * Every path a projection may select beyond the snapshot's own entries: the
 * issue note, knowledge index, and outcome record of the product root and of
 * every node. A caller without a tracked-path set probes these for presence;
 * a tracked-path set already answers for them.
 */
export function specContextOptionalArtifactPaths(snapshot: SpecTreeSnapshot): readonly string[] {
  const directories: { readonly directory: string; readonly slug: string | undefined }[] = [
    { directory: SPEC_TREE_CONFIG.ROOT_DIRECTORY, slug: undefined },
    ...snapshot.allNodes.map((node) => ({ directory: nodeDirectory(node), slug: node.slug })),
  ];
  return directories.flatMap(({ directory, slug }) => [
    `${directory}/${ISSUE_FILENAME}`,
    `${directory}/${KNOWLEDGE_INDEX}`,
    ...(slug === undefined ? [] : [`${directory}/${slug}${OUTCOME_SUFFIX}`]),
  ]);
}

/** Numeric indices establish order; names break equal-index ties independently of locale. */
export function compareSpecContextTreeEntries(
  left: { readonly path: string },
  right: { readonly path: string },
): number {
  const leftName = posix.basename(left.path);
  const rightName = posix.basename(right.path);
  return Number.parseFloat(leftName) - Number.parseFloat(rightName)
    || compareSpecContextOrdinal(leftName, rightName);
}

/** Accumulates target-reason pairs per key, each pair once, in first-binding order. */
class SpecContextReasonBindings<Key> {
  readonly #byKey = new Map<Key, SpecContextTargetSelection[]>();

  bind(key: Key, target: string, reason: SpecContextSelectionReason): void {
    const bindings = this.#byKey.get(key);
    if (bindings === undefined) {
      this.#byKey.set(key, [{ target, reason }]);
      return;
    }
    if (!bindings.some((binding) => binding.target === target && binding.reason === reason)) {
      bindings.push({ target, reason });
    }
  }

  has(key: Key): boolean {
    return this.#byKey.has(key);
  }

  get(key: Key): readonly SpecContextTargetSelection[] {
    return this.#byKey.get(key) ?? [];
  }

  /** The highest mode any bound reason requires, or none when nothing is bound. */
  mode(key: Key): SpecContextMode | undefined {
    return specContextReasonsMode(this.get(key));
  }
}

/**
 * Every reason each target binds, keyed by node identity for node specs, by
 * decision identity for decisions, and by containing node identity — the
 * product root as `undefined` — for the product spec, issue notes, and
 * explicit-target artifacts.
 */
interface SpecContextTargetedReasons {
  readonly product: SpecContextReasonBindings<undefined>;
  readonly nodes: SpecContextReasonBindings<string>;
  readonly decisions: SpecContextReasonBindings<string>;
  readonly containers: SpecContextReasonBindings<string | undefined>;
  readonly explicit: SpecContextReasonBindings<string | undefined>;
}

/**
 * Binds one target's context path: the target and its ancestors, the issue
 * note container each of them is, and every sibling at each level.
 */
function bindSpecContextPath(
  reasons: SpecContextTargetedReasons,
  snapshot: SpecTreeSnapshot,
  target: string,
  contextPath: readonly SpecTreeNode[],
): void {
  const targetNode = contextPath.at(-1);
  for (const pathNode of contextPath) {
    reasons.nodes.bind(
      pathNode.id,
      target,
      pathNode === targetNode ? SPEC_CONTEXT_SELECTION_REASON.TARGET : SPEC_CONTEXT_SELECTION_REASON.ANCESTOR,
    );
    reasons.containers.bind(pathNode.id, target, SPEC_CONTEXT_SELECTION_REASON.ISSUE);
    for (const sibling of specContextSiblings(snapshot, pathNode)) {
      reasons.nodes.bind(sibling.id, target, SPEC_CONTEXT_SELECTION_REASON.SIBLING);
    }
  }
}

/**
 * The reason a path-governing decision holds for one target: a decision
 * directly inside the explicit target — the product root included — is the
 * target's own, a decision directly under the product root is the product's,
 * and every other one is selected at an ancestor.
 */
function specContextDecisionReason(
  decision: SpecTreeDecision,
  targetNode: SpecTreeNode | undefined,
): SpecContextSelectionReason {
  if (decision.parentId === targetNode?.id) return SPEC_CONTEXT_SELECTION_REASON.TARGET;
  if (decision.parentId === undefined) return SPEC_CONTEXT_SELECTION_REASON.PRODUCT;
  return SPEC_CONTEXT_SELECTION_REASON.ANCESTOR;
}

function specContextTargetedReasons(
  snapshot: SpecTreeSnapshot,
  targets: readonly SpecContextTarget[],
): SpecContextTargetedReasons {
  const reasons: SpecContextTargetedReasons = {
    product: new SpecContextReasonBindings(),
    nodes: new SpecContextReasonBindings(),
    decisions: new SpecContextReasonBindings(),
    containers: new SpecContextReasonBindings(),
    explicit: new SpecContextReasonBindings(),
  };
  for (const { path: target, node } of targets) {
    reasons.product.bind(undefined, target, SPEC_CONTEXT_SELECTION_REASON.PRODUCT);
    if (node === undefined) reasons.product.bind(undefined, target, SPEC_CONTEXT_SELECTION_REASON.TARGET);
    reasons.containers.bind(undefined, target, SPEC_CONTEXT_SELECTION_REASON.ISSUE);
    reasons.explicit.bind(node?.id, target, SPEC_CONTEXT_SELECTION_REASON.KNOWLEDGE_INDEX);
    const contextPath = node === undefined ? [] : [...specContextAncestors(snapshot, node), node];
    for (const decision of specContextDecisions(snapshot, contextPath)) {
      reasons.decisions.bind(decision.id, target, specContextDecisionReason(decision, node));
    }
    bindSpecContextPath(reasons, snapshot, target, contextPath);
    for (const child of node?.children ?? snapshot.nodes) {
      reasons.nodes.bind(child.id, target, SPEC_CONTEXT_SELECTION_REASON.IMMEDIATE_CHILD);
    }
  }
  return reasons;
}

/** The pairs of `bound` re-expressed under `reason`, one per bound target. */
function specContextRebind(
  bound: readonly SpecContextTargetSelection[],
  reason: SpecContextSelectionReason,
): readonly SpecContextTargetSelection[] {
  return [...new Set(bound.map(({ target }) => target))].map((target) => ({ target, reason }));
}

/** The context-ingestion failure for a tree whose nodes or root decisions have no product spec to start the walk. */
export const SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR =
  `No product spec in ${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/: the context walk starts at the product spec`;

/**
 * The product spec path the walk starts at, or none for a tree holding no
 * product spec, node, or decision; a tree whose nodes or decisions lack a
 * product spec has no walk and fails.
 */
function specContextWalkRoot(snapshot: SpecTreeSnapshot): string | undefined {
  const productPath = snapshot.product?.ref?.path;
  if (productPath !== undefined || (snapshot.allNodes.length === 0 && snapshot.decisions.length === 0)) {
    return productPath;
  }
  throw new Error(SPEC_CONTEXT_MISSING_PRODUCT_SPEC_ERROR);
}

/**
 * The structural selection for `targets`, in walk order. The walk is rooted
 * at the product spec: a tree holding no product spec, node, or decision
 * selects nothing, while a tree whose nodes or decisions lack a product spec
 * fails before any entry is selected. Each output node's Digest opening is
 * the one `registry` resolves for its kind.
 */
export function selectSpecContextDocuments(
  snapshot: SpecTreeSnapshot,
  targets: readonly SpecContextTarget[],
  existingPaths: ReadonlySet<string>,
  registry: SpecContextKindRegistry,
): readonly SpecContextSelection[] {
  const productPath = specContextWalkRoot(snapshot);
  if (productPath === undefined) return [];
  const discovery = targets.length === 0;
  const reasons = specContextTargetedReasons(snapshot, targets);
  const result: SpecContextSelection[] = [];
  const reference = (path: string, bindings: readonly SpecContextTargetSelection[]): void => {
    if (existingPaths.has(path)) {
      result.push({ path, mode: SPEC_CONTEXT_MODE.REFERENCE, reasons: bindings, optional: true });
    }
  };
  const explicitArtifacts = (node: SpecTreeNode | undefined, directory: string): void => {
    const knowledgeReasons = reasons.explicit.get(node?.id);
    if (knowledgeReasons.length === 0) return;
    if (node !== undefined) {
      const outcome = `${directory}/${node.slug}${OUTCOME_SUFFIX}`;
      if (existingPaths.has(outcome)) {
        result.push({
          path: outcome,
          mode: SPEC_CONTEXT_MODE.FULL,
          reasons: specContextRebind(knowledgeReasons, SPEC_CONTEXT_SELECTION_REASON.OUTCOME_RECORD),
          optional: true,
          scanCitations: true,
        });
      }
    }
    reference(`${directory}/${KNOWLEDGE_INDEX}`, knowledgeReasons);
  };
  const structuralEntries = (node: SpecTreeNode | undefined, depth: number) => {
    const decisions = snapshot.decisions
      .filter((decision) => decision.parentId === node?.id && (discovery || reasons.decisions.has(decision.id)))
      .map((decision) => ({ decision, path: requiredDocumentPath(decision.ref?.path, decision.id) }));
    const children = (node?.children ?? snapshot.nodes)
      .filter((child) => discovery ? depth < DISCOVERY_DEPTH : reasons.nodes.has(child.id))
      .map((child) => ({ child, path: nodeDirectory(child) }));
    return [...decisions, ...children].sort(compareSpecContextTreeEntries);
  };
  const walk = (node: SpecTreeNode | undefined, depth: number): void => {
    const directory = node === undefined ? SPEC_TREE_CONFIG.ROOT_DIRECTORY : nodeDirectory(node);
    const mode = node === undefined
      ? SPEC_CONTEXT_MODE.FULL
      : discovery
      ? SPEC_CONTEXT_MODE.DIGEST
      : reasons.nodes.mode(node.id);
    if (mode === undefined) return;
    result.push(
      ...(node === undefined
        ? [{
          path: productPath,
          mode,
          reasons: reasons.product.get(undefined),
          scanCitations: true,
        }]
        : nodeSelection(node, mode, reasons.nodes.get(node.id), existingPaths, registry)),
    );
    if (discovery || reasons.containers.has(node?.id)) {
      reference(`${directory}/${ISSUE_FILENAME}`, reasons.containers.get(node?.id));
    }
    explicitArtifacts(node, directory);
    for (const entry of structuralEntries(node, depth)) {
      if ("child" in entry) walk(entry.child, depth + 1);
      else {result.push({
          path: entry.path,
          mode: discovery ? SPEC_CONTEXT_MODE.DIGEST : SPEC_CONTEXT_MODE.FULL,
          reasons: reasons.decisions.get(entry.decision.id),
          digest: DECISION_STATEMENT_DIGEST,
          scanCitations: true,
        });}
    }
  };
  walk(undefined, 0);
  return result;
}

/**
 * Separates a terminated front-matter block from the body without reading it:
 * a document whose keys no projection selects keeps whatever metadata syntax
 * its own tooling accepts.
 */
export function splitSpecContextFrontMatter(source: string, path: string): {
  readonly frontMatter: string | undefined;
  readonly body: string;
} {
  const opening = /^---\r?\n/.exec(source);
  if (opening === null) return { frontMatter: undefined, body: source };
  const remainder = source.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  if (closing === null) throw new Error(`Unterminated front matter in ${path}`);
  return {
    frontMatter: remainder.slice(0, closing.index),
    body: remainder.slice(closing.index + closing[0].length),
  };
}

/** The named keys an output node's front matter supplies, read only for the document that selects them. */
function selectSpecContextMetadata(frontMatter: string, path: string): Readonly<Record<string, unknown>> {
  const document = parseDocument(frontMatter);
  if (document.errors.length > 0) throw new Error(`Invalid front matter in ${path}: ${document.errors[0]?.message}`);
  const metadata: unknown = document.toJS();
  if (metadata === null) return {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(`Front matter must be a mapping in ${path}`);
  }
  return Object.hasOwn(metadata, MALLEABILITY_KEY)
    ? { [MALLEABILITY_KEY]: (metadata as Readonly<Record<string, unknown>>)[MALLEABILITY_KEY] }
    : {};
}

const LINE_FEED = "\n";

function linesWithTerminators(body: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (start < body.length) {
    const terminator = body.indexOf(LINE_FEED, start);
    const end = terminator === -1 ? body.length : terminator + LINE_FEED.length;
    lines.push(body.slice(start, end));
    start = end;
  }
  return lines;
}

/** The body's paragraphs, each ending before the next blank or whitespace-only line or end of file. */
function sourceParagraphs(body: string): readonly string[] {
  const paragraphs: string[] = [];
  let paragraph = "";
  for (const line of linesWithTerminators(body)) {
    if (line.trim().length === 0) {
      if (paragraph.length > 0) paragraphs.push(paragraph);
      paragraph = "";
    } else paragraph += line;
  }
  if (paragraph.length > 0) paragraphs.push(paragraph);
  return paragraphs;
}

const TITLE_PARAGRAPH = /^# [^\r\n]+/;

/**
 * Opening-line patterns of the block constructs that are not prose. A paragraph that opens with
 * inline markup — a code span, emphasis, strikethrough, a link, an autolink, or inline HTML — is
 * prose, so each pattern requires the construct's complete block marker: a heading's `#` run
 * followed by whitespace, a list marker followed by whitespace, a fence of three or more backticks
 * or tildes, and an HTML tag that starts an HTML block rather than an inline element.
 */
const NON_PROSE_BLOCK_OPENINGS: readonly RegExp[] = [
  // ATX heading
  /^[\t ]*#{1,6}(?=[\t \r\n]|$)/,
  // Thematic break
  /^[\t ]*(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})(?:\r?\n|$)/,
  // Bullet list item
  /^[\t ]*[-*+](?=[\t \r\n]|$)/,
  // Ordered list item
  /^[\t ]*\d{1,9}[.)](?=[\t \r\n]|$)/,
  // Block quote
  /^[\t ]*>/,
  // Table row
  /^[\t ]*\|/,
  // Fenced code block
  /^[\t ]*(?:`{3,}|~{3,})/,
  // HTML block: raw-text elements, comments, processing instructions, declarations, and CDATA
  /^[\t ]*(?:<(?:script|pre|style|textarea)(?=[\t >\r\n]|$)|<!--|<\?|<![A-Za-z]|<!\[CDATA\[)/i,
  // HTML block: block-level element tags
  /^[\t ]*<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\t \r\n>]|\/>|$)/i,
  // HTML block: any other complete open or closing tag alone on its line
  /^[\t ]*<\/?[A-Za-z][A-Za-z0-9-]*(?:[\t ]+[^\r\n<>]*)?\/?>[\t ]*(?:\r?\n|$)/,
];

function isProseParagraph(paragraph: string): boolean {
  return !NON_PROSE_BLOCK_OPENINGS.some((opening) => opening.test(paragraph));
}

/** A decision's decision statement: the first prose paragraph after its title. */
function decisionStatement(paragraphs: readonly string[]): string | undefined {
  const title = paragraphs.findIndex((paragraph) => TITLE_PARAGRAPH.test(paragraph));
  if (title === -1) return undefined;
  return paragraphs.slice(title + 1).find(isProseParagraph);
}

/** The Digest paragraph `digest` selects from `body`; every missing paragraph fails the projection. */
function digestParagraph(body: string, digest: SpecContextDigest | undefined, path: string): string {
  const failure = SPEC_CONTEXT_PROJECTION_FAILURE_KIND;
  if (digest === undefined) {
    throw new SpecContextProjectionError(failure.NO_DIGEST, path, `No Digest is defined for ${path}`);
  }
  const paragraphs = sourceParagraphs(body);
  if (digest.source === SPEC_CONTEXT_DIGEST_SOURCE.DECISION_STATEMENT) {
    const statement = decisionStatement(paragraphs);
    if (statement === undefined) {
      throw new SpecContextProjectionError(
        failure.MISSING_DECISION_STATEMENT,
        path,
        `Missing decision statement in ${path}`,
      );
    }
    return statement;
  }
  const { keyword } = digest;
  if (keyword === undefined) {
    throw new SpecContextProjectionError(
      failure.UNRESOLVED_KIND_OPENING,
      path,
      `No resolved opening keyword for kind ${digest.kind} in ${path}`,
    );
  }
  const opening = paragraphs.find((paragraph) => paragraph.startsWith(`${keyword} `));
  if (opening === undefined) {
    throw new SpecContextProjectionError(failure.MISSING_OPENING, path, `Missing ${keyword} opening in ${path}`);
  }
  return opening;
}

export function projectSpecContextDocument(selection: SpecContextSelection, source: string): SpecContextEntry {
  if (selection.mode === SPEC_CONTEXT_MODE.REFERENCE) {
    return { type: SPEC_CONTEXT_ENTRY_TYPE.REFERENCE, path: selection.path };
  }
  const { frontMatter, body } = splitSpecContextFrontMatter(source, selection.path);
  const selectedMetadata = selection.outputNode === true && frontMatter !== undefined
    ? selectSpecContextMetadata(frontMatter, selection.path)
    : {};
  const content = selection.mode === SPEC_CONTEXT_MODE.FULL
    ? body
    : digestParagraph(body, selection.digest, selection.path);
  return { type: SPEC_CONTEXT_ENTRY_TYPE.DOCUMENT, path: selection.path, metadata: selectedMetadata, content };
}

/**
 * The decisions one document's inline links bind, each required to name a
 * snapshot decision that exists on disk. The one owner of that rule and of
 * its diagnostic, applied to the complete source of each selected document,
 * whatever its projection mode displays.
 */
export function specContextBoundCitations(
  content: string,
  citing: string,
  decisionPaths: ReadonlySet<string>,
  existingPaths: ReadonlySet<string>,
): readonly string[] {
  const bound = specContextInlineDecisionCitations(content);
  for (const path of bound) {
    if (!decisionPaths.has(path) || !existingPaths.has(path)) {
      throw new Error(`Missing cited decision ${path} in ${citing}`);
    }
  }
  return bound;
}

export function specContextInlineDecisionCitations(content: string): readonly string[] {
  const paths = new Set<string>();
  for (const block of inlineCitationParser.parse(content, {})) {
    for (const token of block.children ?? []) {
      if (token.type !== "link_open") continue;
      const href = token.attrGet("href");
      if (href?.startsWith(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`) === true && /\.(?:adr|pdr)\.md$/.test(href)) {
        paths.add(href);
      }
    }
  }
  return [...paths].sort(compareSpecContextOrdinal);
}

export function specContextCitedSelection(
  path: string,
  reasons: readonly SpecContextTargetSelection[],
): SpecContextSelection {
  return {
    path,
    mode: SPEC_CONTEXT_MODE.FULL,
    reasons,
    digest: DECISION_STATEMENT_DIGEST,
    scanCitations: true,
  };
}

export function renderSpecContextEntries(entries: readonly SpecContextEntry[]): string {
  const syntax = SPEC_CONTEXT_FRAME_SYNTAX;
  return entries.map((entry) => {
    const pathAttribute = `${syntax.PATH_ATTRIBUTE_START}${entry.path}`;
    if (entry.type === SPEC_CONTEXT_ENTRY_TYPE.REFERENCE) {
      return `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.REFERENCE}${pathAttribute}${syntax.SELF_CLOSING_TAG_END}`;
    }
    const metadata = Object.keys(entry.metadata).length === 0
      ? ""
      : `${syntax.FRONT_MATTER_FENCE}${syntax.LINE_BREAK}${
        stringify(entry.metadata)
      }${syntax.FRONT_MATTER_FENCE}${syntax.LINE_BREAK}`;
    const ending = entry.content.endsWith(syntax.LINE_BREAK) ? "" : syntax.LINE_BREAK;
    const opening = `${syntax.OPEN_TAG_START}${SPEC_CONTEXT_FRAME.DOCUMENT}${pathAttribute}${syntax.OPEN_TAG_END}`;
    const closing = `${syntax.CLOSE_TAG_START}${SPEC_CONTEXT_FRAME.DOCUMENT}${syntax.CLOSE_TAG_END}`;
    return `${opening}${syntax.LINE_BREAK}${metadata}${entry.content}${ending}${closing}`;
  }).join(syntax.ENTRY_SEPARATOR);
}
