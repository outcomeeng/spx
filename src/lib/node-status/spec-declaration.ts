import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import {
  parseSpecTreeNodeDirectoryName,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";

import { NODE_STATUS_DEFAULT_MALLEABILITY, NODE_STATUS_MALLEABILITY, type NodeStatusMalleability } from "./claim";

const AUDIT_RULE_TAG = /\[audit:([^\]\s]+)\]/g;
const AUDIT_RULE_SLUG_GROUP = 1;
const LINE_BREAK = /\r?\n/;
const HEADING_PREFIX = "#";
/** The heading of a 4.0 group of Audit rows at level 2 or 3: `## Audit` or `### Audit`, optionally followed by `: {subject}`. */
const AUDIT_GROUP_HEADING = /^#{2,3}\s+Audit(?::|\s*$)/;
/** A 4.0 Audit row: a top-level bullet that opens with its slug and a colon. */
const AUDIT_ROW = /^- ([a-z\d][a-z\d-]*):\s/;
const TEXT_ENCODING = "utf8";

/** What a node's spec declares that its claim is measured against. */
export interface NodeSpecDeclaration {
  /** Product-relative path of the spec file. */
  readonly specPath: string;
  readonly malleability: NodeStatusMalleability;
  /** The rule slugs of the spec's `[audit:{rule-slug}]` assertions, in document order. */
  readonly auditRuleSlugs: readonly string[];
  /** The slugs of the spec's 4.0 Audit rows, `- {slug}:` lines under an `### Audit` heading, in document order. */
  readonly auditRowSlugs: readonly string[];
}

const MALLEABILITIES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MALLEABILITY));

/**
 * Read a node's spec: the malleability its front matter declares (the absent field means the implementation
 * layer) and the audit rule slugs its assertions tag. A spec that cannot be read declares the defaults.
 */
export async function readNodeSpecDeclaration(productDir: string, nodeId: string): Promise<NodeSpecDeclaration> {
  const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${nodeId}`;
  const directoryName = nodeId.slice(nodeId.lastIndexOf(SPEC_TREE_GRAMMAR.PATH_SEPARATOR) + 1);
  const slug = parseSpecTreeNodeDirectoryName(directoryName)?.slug ?? directoryName;
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
      auditRowSlugs: auditRowSlugsOf(source),
    };
  }
  return {
    specPath: candidates[candidates.length - 1] ?? nodePath,
    malleability: NODE_STATUS_DEFAULT_MALLEABILITY,
    auditRuleSlugs: [],
    auditRowSlugs: [],
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
  for (const match of source.matchAll(AUDIT_RULE_TAG)) {
    const slug = match.at(AUDIT_RULE_SLUG_GROUP);
    if (slug !== undefined) slugs.add(slug);
  }
  return [...slugs];
}

/** The slugs of the spec's 4.0 Audit rows: each `- {slug}:` line under an `### Audit` heading, in document order. */
function auditRowSlugsOf(source: string): readonly string[] {
  const slugs = new Set<string>();
  let underAuditHeading = false;
  for (const line of source.split(LINE_BREAK)) {
    if (line.startsWith(HEADING_PREFIX)) {
      underAuditHeading = AUDIT_GROUP_HEADING.test(line);
      continue;
    }
    if (!underAuditHeading) continue;
    const slug = AUDIT_ROW.exec(line)?.[AUDIT_RULE_SLUG_GROUP];
    if (slug !== undefined) slugs.add(slug);
  }
  return [...slugs];
}
