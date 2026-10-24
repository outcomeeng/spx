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
const LINKED_AUDIT_TAG = /\[audit\]\(audits\/([^)\s]+)\.md\)/g;
const PATHLESS_REVIEW_TAG = /\(\[review\]\)/;
const PATHLESS_AUDIT_TAG = /\(\[audit\]\)/;
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
  for (const match of [...source.matchAll(AUDIT_RULE_TAG), ...source.matchAll(LINKED_AUDIT_TAG)]) {
    const slug = match.at(AUDIT_RULE_SLUG_GROUP);
    if (slug !== undefined) slugs.add(slug);
  }
  return [...slugs];
}

function auditTagFormsOf(source: string): readonly NodeStatusSourceAuditTagForm[] {
  const forms: NodeStatusSourceAuditTagForm[] = [];
  if (source.matchAll(LINKED_AUDIT_TAG).next().done === false) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.LINKED);
  if (PATHLESS_REVIEW_TAG.test(source)) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.REVIEW);
  if (PATHLESS_AUDIT_TAG.test(source)) forms.push(NODE_STATUS_SOURCE_AUDIT_TAG_FORM.AUDIT);
  return forms;
}
