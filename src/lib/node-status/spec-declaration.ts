import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import {
  parseSpecTreeNodeDirectoryName,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_KEY_KIND,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_VERIFICATION_TYPE,
  type SpecTreeEvidenceReference,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";

import { NODE_STATUS_DEFAULT_MALLEABILITY, NODE_STATUS_MALLEABILITY, type NodeStatusMalleability } from "./claim";

const TEXT_ENCODING = "utf8";

/** What a node's spec declares that its claim is measured against. */
export interface NodeSpecDeclaration {
  /** Product-relative path of the spec file. */
  readonly specPath: string;
  readonly malleability: NodeStatusMalleability;
  /** The keys of the spec's keyed audit references, as the spec-tree library reads them, in document order. */
  readonly auditSlugs: readonly string[];
}

const MALLEABILITIES: ReadonlySet<string> = new Set(Object.values(NODE_STATUS_MALLEABILITY));

/** The keys of a node's keyed audit references, as the spec-tree library reads them from its spec, each once, in order. */
export function auditSlugsOfReferences(references: readonly SpecTreeEvidenceReference[]): readonly string[] {
  const slugs = new Set<string>();
  for (const { verificationType, key } of references) {
    if (verificationType === SPEC_TREE_VERIFICATION_TYPE.AUDIT && key.kind === SPEC_TREE_EVIDENCE_KEY_KIND.SLUG) {
      slugs.add(key.slug);
    }
  }
  return [...slugs];
}

/**
 * Read a node's spec: the malleability its front matter declares (the absent field means the implementation
 * layer), with the audit slugs the spec-tree library read from it. A spec that cannot be read declares the defaults.
 */
export async function readNodeSpecDeclaration(
  productDir: string,
  nodeId: string,
  auditSlugs: readonly string[] = [],
): Promise<NodeSpecDeclaration> {
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
    return { specPath, malleability: declaredMalleability(source, specPath), auditSlugs };
  }
  return {
    specPath: candidates[candidates.length - 1] ?? nodePath,
    malleability: NODE_STATUS_DEFAULT_MALLEABILITY,
    auditSlugs,
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
