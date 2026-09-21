import { posix } from "node:path";

import MarkdownIt from "markdown-it";
import { parseDocument, stringify } from "yaml";

import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "./config";
import { compareSpecContextOrdinal } from "./context-manifest";
import { specContextAncestors, specContextSiblings } from "./context-read-set";
import type { SpecContextTarget } from "./context-target";
import type { SpecTreeNode, SpecTreeSnapshot } from "./index";

export const SPEC_CONTEXT_MODE = { REFERENCE: 0, DIGEST: 1, FULL: 2 } as const;
export type SpecContextMode = (typeof SPEC_CONTEXT_MODE)[keyof typeof SPEC_CONTEXT_MODE];

/** The methodology-fixed opening keywords of the two document classes outside the kind registry. */
export const SPEC_CONTEXT_DOCUMENT_OPENING = { PRODUCT: "OFFERS", DECISION: "GOVERNS" } as const;

/** The node-local artifacts a projection selects only when present: the issue note, the knowledge index, the outcome record. */
export const SPEC_CONTEXT_OPTIONAL_ARTIFACT = {
  ISSUES: SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES,
  KNOWLEDGE_INDEX: "knowledge/index.md",
  OUTCOME_SUFFIX: ".outcome.md",
} as const;

const DISCOVERY_DEPTH = 2;
const PRODUCT_OPENING = SPEC_CONTEXT_DOCUMENT_OPENING.PRODUCT;
const DECISION_OPENING = SPEC_CONTEXT_DOCUMENT_OPENING.DECISION;
const ISSUE_FILENAME = SPEC_CONTEXT_OPTIONAL_ARTIFACT.ISSUES;
const KNOWLEDGE_INDEX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.KNOWLEDGE_INDEX;
const OUTCOME_SUFFIX = SPEC_CONTEXT_OPTIONAL_ARTIFACT.OUTCOME_SUFFIX;
/** The text frames of the two entry classes: an element per document, a self-closing element per reference. */
export const SPEC_CONTEXT_FRAME = { DOCUMENT: "spx-document", REFERENCE: "spx-reference" } as const;

/** The one front-matter key an output node's projection selects. */
export const SPEC_CONTEXT_SELECTED_METADATA_KEY = "malleability";

const FRONT_MATTER_DELIMITER = "---";
const MALLEABILITY_KEY = SPEC_CONTEXT_SELECTED_METADATA_KEY;
const inlineCitationParser = new MarkdownIt().disable("reference");

export interface SpecContextSelection {
  readonly path: string;
  readonly mode: SpecContextMode;
  readonly opening?: string;
  readonly outputNode?: boolean;
  readonly migrationFallback?: boolean;
  readonly scanCitations?: boolean;
  readonly optional?: boolean;
}

export type SpecContextEntry =
  | { readonly type: "reference"; readonly path: string }
  | {
    readonly type: "document";
    readonly path: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly content: string;
  };

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

function nodeSelection(node: SpecTreeNode, mode: SpecContextMode): SpecContextSelection {
  return {
    path: requiredDocumentPath(node.ref?.path, nodeDirectory(node)),
    mode,
    opening: KIND_REGISTRY[node.kind].opening,
    outputNode: true,
    scanCitations: true,
  };
}

/**
 * Every path a projection may select beyond the snapshot's own entries: the
 * coordination notes, guides, knowledge index, and outcome record of the
 * product root and of every node. A caller without a tracked-path set probes
 * these for presence; a tracked-path set already answers for them.
 */
export function specContextOptionalArtifactPaths(snapshot: SpecTreeSnapshot): readonly string[] {
  const directories: { readonly directory: string; readonly slug: string | undefined }[] = [
    { directory: SPEC_TREE_CONFIG.ROOT_DIRECTORY, slug: undefined },
    ...snapshot.allNodes.map((node) => ({ directory: nodeDirectory(node), slug: node.slug })),
  ];
  return [
    ...SPEC_TREE_GRAMMAR.GUIDE_FILES,
    ...directories.flatMap(({ directory, slug }) => [
      ...SPEC_TREE_GRAMMAR.COORDINATION_NOTES.map((name) => `${directory}/${name}`),
      ...SPEC_TREE_GRAMMAR.GUIDE_FILES.map((name) => `${directory}/${name}`),
      `${directory}/${KNOWLEDGE_INDEX}`,
      ...(slug === undefined ? [] : [`${directory}/${slug}${OUTCOME_SUFFIX}`]),
    ]),
  ];
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

export function mergeSpecContextSelections(
  selections: readonly SpecContextSelection[],
): readonly SpecContextSelection[] {
  const merged = new Map<string, SpecContextSelection>();
  for (const selection of selections) {
    const previous = merged.get(selection.path);
    if (previous === undefined || selection.mode > previous.mode) merged.set(selection.path, selection);
  }
  return [...merged.values()];
}

export function selectSpecContextDocuments(
  snapshot: SpecTreeSnapshot,
  targets: readonly SpecContextTarget[],
  existingPaths: ReadonlySet<string>,
): readonly SpecContextSelection[] {
  const selected = new Map<string, SpecContextMode>();
  const fullContainers = new Set<string | undefined>([undefined]);
  const explicit = new Set(targets.flatMap(({ node }) => node === undefined ? [] : [node.id]));
  const discovery = targets.length === 0;
  const put = (node: SpecTreeNode, mode: SpecContextMode): void => {
    const previous = selected.get(node.id);
    if (previous === undefined || mode > previous) selected.set(node.id, mode);
  };
  for (const { node } of targets) {
    if (node === undefined) {
      for (const child of snapshot.nodes) put(child, SPEC_CONTEXT_MODE.DIGEST);
      continue;
    }
    for (const ancestor of [...specContextAncestors(snapshot, node), node]) {
      put(ancestor, SPEC_CONTEXT_MODE.FULL);
      fullContainers.add(ancestor.id);
      for (const sibling of specContextSiblings(snapshot, ancestor)) put(sibling, SPEC_CONTEXT_MODE.DIGEST);
    }
    for (const child of node.children) put(child, SPEC_CONTEXT_MODE.DIGEST);
  }
  const result: SpecContextSelection[] = [];
  const reference = (path: string): void => {
    if (existingPaths.has(path)) result.push({ path, mode: SPEC_CONTEXT_MODE.REFERENCE, optional: true });
  };
  const explicitArtifacts = (node: SpecTreeNode | undefined, directory: string): void => {
    const isExplicit = node === undefined ? targets.some((target) => target.node === undefined) : explicit.has(node.id);
    if (!isExplicit) return;
    if (node !== undefined) {
      const outcome = `${directory}/${node.slug}${OUTCOME_SUFFIX}`;
      if (existingPaths.has(outcome)) result.push({ path: outcome, mode: SPEC_CONTEXT_MODE.FULL, optional: true });
    }
    reference(`${directory}/${KNOWLEDGE_INDEX}`);
  };
  const structuralEntries = (node: SpecTreeNode | undefined, depth: number) => {
    const decisions = discovery || fullContainers.has(node?.id)
      ? snapshot.decisions.filter((decision) => decision.parentId === node?.id)
        .map((decision) => ({ decision, path: requiredDocumentPath(decision.ref?.path, decision.id) }))
      : [];
    const children = (node?.children ?? snapshot.nodes)
      .filter((child) => discovery ? depth < DISCOVERY_DEPTH : selected.has(child.id))
      .map((child) => ({ child, path: nodeDirectory(child) }));
    return [...decisions, ...children].sort(compareSpecContextTreeEntries);
  };
  const walk = (node: SpecTreeNode | undefined, depth: number): void => {
    const directory = node === undefined ? SPEC_TREE_CONFIG.ROOT_DIRECTORY : nodeDirectory(node);
    const mode = node === undefined
      ? SPEC_CONTEXT_MODE.FULL
      : discovery
      ? SPEC_CONTEXT_MODE.DIGEST
      : selected.get(node.id);
    if (mode === undefined) return;
    result.push(
      node === undefined
        ? {
          path: requiredDocumentPath(snapshot.product?.ref?.path, directory),
          mode,
          opening: PRODUCT_OPENING,
          migrationFallback: true,
          scanCitations: true,
        }
        : nodeSelection(node, mode),
    );
    if (discovery || fullContainers.has(node?.id)) reference(`${directory}/${ISSUE_FILENAME}`);
    explicitArtifacts(node, directory);
    for (const entry of structuralEntries(node, depth)) {
      if ("child" in entry) walk(entry.child, depth + 1);
      else {result.push({
          path: entry.path,
          mode: discovery ? SPEC_CONTEXT_MODE.DIGEST : SPEC_CONTEXT_MODE.FULL,
          opening: DECISION_OPENING,
          migrationFallback: true,
          scanCitations: true,
        });}
    }
  };
  walk(undefined, 0);
  return result;
}

export function splitSpecContextFrontMatter(source: string, path: string): {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly body: string;
} {
  const opening = /^---\r?\n/.exec(source);
  if (opening === null) return { metadata: {}, body: source };
  const remainder = source.slice(opening[0].length);
  const closing = /^---(?:\r?\n|$)/m.exec(remainder);
  if (closing === null) throw new Error(`Unterminated front matter in ${path}`);
  const document = parseDocument(remainder.slice(0, closing.index));
  if (document.errors.length > 0) throw new Error(`Invalid front matter in ${path}: ${document.errors[0]?.message}`);
  const metadata: unknown = document.toJS();
  if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata))) {
    throw new Error(`Front matter must be a mapping in ${path}`);
  }
  return {
    metadata: metadata === null ? {} : metadata as Readonly<Record<string, unknown>>,
    body: remainder.slice(closing.index + closing[0].length),
  };
}

function openingParagraph(body: string, keyword: string | undefined, fallback: boolean): string | undefined {
  const paragraphs: string[] = [];
  let paragraph = "";
  for (const [line] of body.matchAll(/[^\n]*\n|[^\n]+$/g)) {
    if (line.trim().length === 0) {
      if (paragraph.length > 0) paragraphs.push(paragraph);
      paragraph = "";
    } else paragraph += line;
  }
  if (paragraph.length > 0) paragraphs.push(paragraph);
  const opening = keyword === undefined
    ? undefined
    : paragraphs.find((paragraph) => paragraph.startsWith(`${keyword} `));
  if (opening !== undefined || !fallback) return opening;
  const title = paragraphs.findIndex((paragraph) => /^# [^\r\n]+/.test(paragraph));
  return paragraphs.slice(title + 1).find((paragraph) => !/^[\t ]*(?:#|[-*+]>?|\d+\.|>|\||`|~|<)/.test(paragraph));
}

export function projectSpecContextDocument(
  selection: SpecContextSelection,
  source: string,
  migrating: boolean,
): SpecContextEntry {
  if (selection.mode === SPEC_CONTEXT_MODE.REFERENCE) return { type: "reference", path: selection.path };
  const { metadata, body } = splitSpecContextFrontMatter(source, selection.path);
  const selectedMetadata = selection.outputNode === true && Object.hasOwn(metadata, MALLEABILITY_KEY)
    ? { [MALLEABILITY_KEY]: metadata[MALLEABILITY_KEY] }
    : {};
  const content = selection.mode === SPEC_CONTEXT_MODE.FULL
    ? body
    : openingParagraph(body, selection.opening, migrating && selection.migrationFallback === true);
  if (content === undefined) {
    throw new Error(`Missing ${selection.opening ?? "kind opening"} paragraph in ${selection.path}`);
  }
  return { type: "document", path: selection.path, metadata: selectedMetadata, content };
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

export function specContextCitedSelection(path: string): SpecContextSelection {
  return {
    path,
    mode: SPEC_CONTEXT_MODE.FULL,
    opening: DECISION_OPENING,
    migrationFallback: true,
    scanCitations: true,
  };
}

export function suppressLoadedSpecContext(
  requested: readonly SpecContextProjectedEntry[],
  loaded: readonly SpecContextProjectedEntry[],
): readonly SpecContextEntry[] {
  const modes = new Map(
    mergeSpecContextSelections(loaded.map(({ selection }) => selection))
      .map(({ path, mode }) => [path, mode]),
  );
  return requested.filter(({ selection }) => (modes.get(selection.path) ?? -1) < selection.mode)
    .map(({ entry }) => entry);
}

export function renderSpecContextEntries(entries: readonly SpecContextEntry[]): string {
  return entries.map((entry) => {
    if (entry.type === "reference") return `<${SPEC_CONTEXT_FRAME.REFERENCE} path="${entry.path}" />`;
    const metadata = Object.keys(entry.metadata).length === 0
      ? ""
      : `${FRONT_MATTER_DELIMITER}\n${stringify(entry.metadata)}${FRONT_MATTER_DELIMITER}\n\n`;
    const ending = entry.content.endsWith("\n") ? "" : "\n";
    return `<${SPEC_CONTEXT_FRAME.DOCUMENT} path="${entry.path}">\n${metadata}${entry.content}${ending}</${SPEC_CONTEXT_FRAME.DOCUMENT}>`;
  }).join("\n\n");
}
