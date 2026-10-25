import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import {
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";

import { NODE_STATUS_DEFAULT_MALLEABILITY, NODE_STATUS_MALLEABILITY, type NodeStatusMalleability } from "./claim";

const SLUG_OF_DIRECTORY = /^\d+(?:\.\d+)?-(.+)\.[a-z]+$/;
const AUDIT_RULE_TAG = /\[audit:([^\]\s]+)\]/g;
const CODE_SPAN_BACKTICK_RUN = /`+/g;
const CODE_SPAN_REPLACEMENT = " ";
const AUDIT_RULE_SLUG_GROUP = 1;
const TEXT_ENCODING = "utf8";

/** The audit-tag forms a spec written in the migration source's grammar carries. */
export const NODE_STATUS_SOURCE_AUDIT_TAG_FORM = {
  NONE: "none",
  /** `[audit](audits/{rule-slug}.md)`, which keys an audit entry by its rule slug. */
  LINKED: "linked",
  /** `([review])`, which carries no rule slug. */
  REVIEW: "review",
  /** `([audit])`, which carries no rule slug. */
  AUDIT: "audit",
} as const;

export type NodeStatusSourceAuditTagForm =
  (typeof NODE_STATUS_SOURCE_AUDIT_TAG_FORM)[keyof typeof NODE_STATUS_SOURCE_AUDIT_TAG_FORM];

const LINKED_TAG_OPENING = "[audit](audits/";
const LINKED_TAG_CLOSING = ".md)";
const PATHLESS_REVIEW_TAG_TEXT = "([review])";
const PATHLESS_AUDIT_TAG_TEXT = "([audit])";
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

function escapedForPattern(text: string): string {
  return text.replace(REGEXP_SPECIAL_CHARACTERS, String.raw`\$&`);
}

/**
 * The tag text a spec written in the migration source's grammar carries for an audit-tag form: the linked form
 * names its rule slug, the two pathless forms carry none, and the absent form renders no text.
 */
export function renderNodeStatusSourceAuditTag(form: NodeStatusSourceAuditTagForm, ruleSlug: string): string {
  switch (form) {
    case NODE_STATUS_SOURCE_AUDIT_TAG_FORM.NONE:
      return "";
    case NODE_STATUS_SOURCE_AUDIT_TAG_FORM.LINKED:
      return `${LINKED_TAG_OPENING}${ruleSlug}${LINKED_TAG_CLOSING}`;
    case NODE_STATUS_SOURCE_AUDIT_TAG_FORM.REVIEW:
      return PATHLESS_REVIEW_TAG_TEXT;
    case NODE_STATUS_SOURCE_AUDIT_TAG_FORM.AUDIT:
      return PATHLESS_AUDIT_TAG_TEXT;
  }
}

const LINKED_AUDIT_TAG = new RegExp(
  String.raw`${escapedForPattern(LINKED_TAG_OPENING)}([^)\s]+)${escapedForPattern(LINKED_TAG_CLOSING)}`,
  "g",
);
const PATHLESS_REVIEW_TAG = new RegExp(escapedForPattern(PATHLESS_REVIEW_TAG_TEXT));
const PATHLESS_AUDIT_TAG = new RegExp(escapedForPattern(PATHLESS_AUDIT_TAG_TEXT));

/**
 * The source with every inline code span removed. A span opens with a run of N backticks and closes with the
 * next run of exactly N backticks; a run with no such closer is literal text.
 */
function withoutCodeSpans(source: string): string {
  const runs = [...source.matchAll(CODE_SPAN_BACKTICK_RUN)];
  let prose = "";
  let cursor = 0;
  let index = 0;
  while (index < runs.length) {
    const opening = runs[index];
    const closingIndex = runs.findIndex((run, at) => at > index && run[0].length === opening[0].length);
    if (closingIndex === -1) {
      index += 1;
      continue;
    }
    const closing = runs[closingIndex];
    prose += source.slice(cursor, opening.index) + CODE_SPAN_REPLACEMENT;
    cursor = closing.index + closing[0].length;
    index = closingIndex + 1;
  }
  return prose + source.slice(cursor);
}

/** What a node's spec declares that its claim is measured against. */
export interface NodeSpecDeclaration {
  /** Product-relative path of the spec file. */
  readonly specPath: string;
  readonly malleability: NodeStatusMalleability;
  /** The rule slugs of the spec's `[audit:{rule-slug}]` assertions, in document order. */
  readonly auditRuleSlugs: readonly string[];
  /** The source-grammar audit-tag forms the spec carries; empty when it carries none. */
  readonly auditTagForms: readonly NodeStatusSourceAuditTagForm[];
}

const MALLEABILITIES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MALLEABILITY));

/**
 * Read a node's spec: the malleability its front matter declares (the absent field means the implementation
 * layer) and the audit rule slugs its assertions tag. A spec that cannot be read declares the defaults.
 */
export async function readNodeSpecDeclaration(productDir: string, nodeId: string): Promise<NodeSpecDeclaration> {
  const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${nodeId}`;
  const directoryName = nodeId.slice(nodeId.lastIndexOf(SPEC_TREE_GRAMMAR.PATH_SEPARATOR) + 1);
  const slug = SLUG_OF_DIRECTORY.exec(directoryName)?.[1] ?? directoryName;
  const candidates = [
    SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
  ].map((suffix) => `${nodePath}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${slug}${suffix}`);
  for (const specPath of candidates) {
    let source: string;
    try {
      source = await readFile(join(productDir, specPath), TEXT_ENCODING);
    } catch {
      continue;
    }
    return {
      specPath,
      malleability: declaredMalleability(source, specPath),
      auditRuleSlugs: auditSlugsOf(source),
      auditTagForms: auditTagFormsOf(source),
    };
  }
  return {
    specPath: candidates[candidates.length - 1] ?? nodePath,
    malleability: NODE_STATUS_DEFAULT_MALLEABILITY,
    auditRuleSlugs: [],
    auditTagForms: [],
  };
}

function declaredMalleability(source: string, specPath: string): NodeStatusMalleability {
  const { frontMatter } = splitSpecContextFrontMatter(source, specPath);
  if (frontMatter === undefined) return NODE_STATUS_DEFAULT_MALLEABILITY;
  const metadata: unknown = parse(frontMatter);
  const declared = typeof metadata === "object" && metadata !== null
    ? (metadata as Readonly<Record<string, unknown>>)[SPEC_CONTEXT_SELECTED_METADATA_KEY]
    : undefined;
  return typeof declared === "string" && MALLEABILITIES.has(declared)
    ? (declared as NodeStatusMalleability)
    : NODE_STATUS_DEFAULT_MALLEABILITY;
}

function auditSlugsOf(source: string): readonly string[] {
  const slugs = new Set<string>();
  const prose = withoutCodeSpans(source);
  for (const match of [...prose.matchAll(AUDIT_RULE_TAG), ...prose.matchAll(LINKED_AUDIT_TAG)]) {
    const slug = match.at(AUDIT_RULE_SLUG_GROUP);
    if (slug !== undefined) slugs.add(slug);
  }
  return [...slugs];
}

function auditTagFormsOf(source: string): readonly NodeStatusSourceAuditTagForm[] {
  const forms: NodeStatusSourceAuditTagForm[] = [];
  const prose = withoutCodeSpans(source);
  if (prose.matchAll(LINKED_AUDIT_TAG).next().done === false) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.LINKED);
  if (PATHLESS_REVIEW_TAG.test(prose)) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.REVIEW);
  if (PATHLESS_AUDIT_TAG.test(prose)) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.AUDIT);
  return forms;
}
