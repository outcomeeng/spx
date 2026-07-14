import { access } from "node:fs/promises";
import { join } from "node:path";

import { type MethodologyIdentity, resolveMethodologyIdentity } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import { resolveSpecContextTarget, type SpecContextTargetFailure } from "@/domains/spec/context-target";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { defaultGitDependencies } from "@/lib/git/root";
import type { GitDependencies } from "@/lib/git/root";
import {
  createTrackedPathInclusion,
  listTrackedPaths,
  TRACKED_PATH_DIRECTORY_SEPARATOR,
} from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeDecision,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

export const SPEC_CONTEXT_DOCUMENT_ROLE = {
  PRODUCT: "product",
  ANCESTOR: "ancestor",
  TARGET: "target",
  DECISION: "decision",
  LOWER_INDEX_SIBLING: "lower-index-sibling",
  EVIDENCE: "evidence",
  COORDINATION: "coordination",
} as const;

export const SPEC_CONTEXT_COORDINATION_FILE = {
  PLAN: "PLAN.md",
  ISSUES: "ISSUES.md",
} as const;

export interface SpecContextDocument {
  readonly path: string;
  readonly role: string;
}

export interface SpecContextSiblingSummary {
  readonly sameIndex: readonly string[];
  readonly higherIndex: readonly string[];
}

export interface SpecContextManifest {
  readonly methodology: MethodologyIdentity;
  readonly productDir: string;
  readonly target: string;
  readonly documents: readonly SpecContextDocument[];
  readonly siblings: SpecContextSiblingSummary;
}

export type SpecContextManifestResolution =
  | { readonly ok: true; readonly manifest: SpecContextManifest }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

export interface ContextOptions {
  readonly target: string;
  readonly cwd?: string;
  readonly gitDependencies?: GitDependencies;
  readonly onWarning?: SpecProductDirWarningHandler;
}

const JSON_INDENTATION = 2;
const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;

export const SPEC_CONTEXT_TEXT_LABEL = {
  TARGET: "Target",
  PRODUCT_ROOT: "Product root",
  METHODOLOGY: "Methodology",
  DOCUMENTS: "Documents",
  SAME_INDEX_SIBLINGS: "Same-index siblings",
  HIGHER_INDEX_SIBLINGS: "Higher-index siblings",
} as const;

const TEXT_LIST_INDENT = "  - ";

function refPath(ref: SpecTreeSourceRef | undefined): string | undefined {
  return ref?.path;
}

function sortPaths(paths: readonly string[]): readonly string[] {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function fullSpecPath(path: string): string {
  return path.startsWith(SPEC_TREE_ROOT_PREFIX) ? path : `${SPEC_TREE_ROOT_PREFIX}${path}`;
}

function childSpecPath(parent: string, child: string): string {
  return `${parent}${TRACKED_PATH_DIRECTORY_SEPARATOR}${child}`;
}

function pushDocument(documents: SpecContextDocument[], role: string, path: string | undefined): void {
  if (path !== undefined) {
    documents.push({ role, path });
  }
}

async function pushExistingDocument(
  documents: SpecContextDocument[],
  role: string,
  productDir: string,
  path: string | undefined,
  includePath: (path: string) => boolean | Promise<boolean>,
): Promise<void> {
  if (path === undefined || !await optionalSpecTreeFile(productDir, path, includePath)) {
    return;
  }
  documents.push({ role, path });
}

function ancestorsFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  const byId = new Map(snapshot.allNodes.map((node) => [node.id, node]));
  const ancestors: SpecTreeNode[] = [];
  let currentParent = target.parentId;
  while (currentParent !== undefined) {
    const parent = byId.get(currentParent);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    currentParent = parent.parentId;
  }
  return ancestors;
}

function siblingsFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  return snapshot.allNodes
    .filter((node) => node.parentId === target.parentId && node.id !== target.id);
}

function lowerIndexSiblingsForContextNodes(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeNode[] {
  const seen = new Set<string>();
  const lowerSiblings: SpecTreeNode[] = [];
  for (const contextNode of contextNodes) {
    for (const sibling of siblingsFor(snapshot, contextNode)) {
      if (sibling.order >= contextNode.order || seen.has(sibling.id)) continue;
      lowerSiblings.push(sibling);
      seen.add(sibling.id);
    }
  }
  lowerSiblings.sort((left, right) => {
    const parentComparison = (left.parentId ?? "").localeCompare(right.parentId ?? "");
    if (parentComparison !== 0) return parentComparison;
    const orderComparison = left.order - right.order;
    if (orderComparison !== 0) return orderComparison;
    return left.id.localeCompare(right.id);
  });
  return lowerSiblings;
}

function decisionsFor(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeDecision[] {
  const constrainingOrderByParentId = new Map(
    contextNodes.map((node) => [node.parentId, node.order] as const),
  );
  const targetId = contextNodes.at(-1)?.id;
  return snapshot.decisions.filter((decision) => {
    if (decision.parentId === targetId) return true;
    const constrainingOrder = constrainingOrderByParentId.get(decision.parentId);
    return constrainingOrder !== undefined && decision.order < constrainingOrder;
  });
}

function evidenceFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeEvidenceSourceEntry[] {
  return snapshot.entries.filter(
    (entry): entry is SpecTreeEvidenceSourceEntry =>
      entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE && entry.parentId === target.id,
  );
}

async function optionalFile(
  productDir: string,
  relativePath: string,
  includePath: (path: string) => boolean | Promise<boolean>,
): Promise<string | undefined> {
  return optionalSpecTreeFile(productDir, fullSpecPath(relativePath), includePath);
}

async function optionalSpecTreeFile(
  productDir: string,
  specTreePath: string,
  includePath: (path: string) => boolean | Promise<boolean>,
): Promise<string | undefined> {
  if (!await includePath(specTreePath)) return undefined;
  try {
    await access(join(productDir, specTreePath));
    return specTreePath;
  } catch {
    return undefined;
  }
}

async function coordinationDocuments(
  productDir: string,
  target: SpecTreeNode,
  includePath: (path: string) => boolean | Promise<boolean>,
): Promise<readonly string[]> {
  return [
    await optionalFile(productDir, childSpecPath(target.id, SPEC_CONTEXT_COORDINATION_FILE.PLAN), includePath),
    await optionalFile(productDir, childSpecPath(target.id, SPEC_CONTEXT_COORDINATION_FILE.ISSUES), includePath),
  ].filter((path): path is string => path !== undefined);
}

async function buildManifest(
  productDir: string,
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
  includePath: (path: string) => boolean | Promise<boolean>,
): Promise<SpecContextManifest> {
  const ancestors = ancestorsFor(snapshot, target);
  const contextNodes = [...ancestors, target];
  const siblings = siblingsFor(snapshot, target);
  const lowerSiblings = lowerIndexSiblingsForContextNodes(snapshot, contextNodes);
  const sameIndex = sortPaths(
    siblings.filter((node) => node.order === target.order).map((node) => fullSpecPath(node.id)),
  );
  const higherIndex = sortPaths(
    siblings.filter((node) => node.order > target.order).map((node) => fullSpecPath(node.id)),
  );
  const methodologyConfig = await resolveMethodologyConfig(productDir);
  if (!methodologyConfig.ok) {
    throw new Error(methodologyConfig.error);
  }
  const methodology = resolveMethodologyIdentity(methodologyConfig.value);

  const documents: SpecContextDocument[] = [];
  await pushExistingDocument(
    documents,
    SPEC_CONTEXT_DOCUMENT_ROLE.PRODUCT,
    productDir,
    refPath(snapshot.product?.ref),
    includePath,
  );
  for (const ancestor of ancestors) {
    await pushExistingDocument(
      documents,
      SPEC_CONTEXT_DOCUMENT_ROLE.ANCESTOR,
      productDir,
      refPath(ancestor.ref),
      includePath,
    );
  }
  await pushExistingDocument(
    documents,
    SPEC_CONTEXT_DOCUMENT_ROLE.TARGET,
    productDir,
    refPath(target.ref),
    includePath,
  );
  for (const decision of decisionsFor(snapshot, contextNodes)) {
    await pushExistingDocument(
      documents,
      SPEC_CONTEXT_DOCUMENT_ROLE.DECISION,
      productDir,
      refPath(decision.ref),
      includePath,
    );
  }
  for (const sibling of lowerSiblings) {
    await pushExistingDocument(
      documents,
      SPEC_CONTEXT_DOCUMENT_ROLE.LOWER_INDEX_SIBLING,
      productDir,
      refPath(sibling.ref),
      includePath,
    );
  }
  for (const evidence of evidenceFor(snapshot, target)) {
    await pushExistingDocument(
      documents,
      SPEC_CONTEXT_DOCUMENT_ROLE.EVIDENCE,
      productDir,
      refPath(evidence.ref),
      includePath,
    );
  }
  for (const path of await coordinationDocuments(productDir, target, includePath)) {
    pushDocument(documents, SPEC_CONTEXT_DOCUMENT_ROLE.COORDINATION, path);
  }

  return {
    methodology,
    productDir,
    target: fullSpecPath(target.id),
    documents,
    siblings: {
      sameIndex,
      higherIndex,
    },
  };
}

export async function resolveContextManifest(options: ContextOptions): Promise<SpecContextManifestResolution> {
  const gitDependencies = options.gitDependencies ?? defaultGitDependencies;
  const productDir = await resolveSpecProductDir(
    options.cwd ?? CONFIG_PROCESS_CWD.read(),
    gitDependencies,
    options.onWarning,
  );
  const trackedPaths = await listTrackedPaths(productDir, gitDependencies);
  const includePath = createTrackedPathInclusion(trackedPaths);
  const snapshot = await readSpecTree({
    source: createFilesystemSpecTreeSource({
      productDir,
      includePath,
    }),
  });
  const resolution = resolveSpecContextTarget(snapshot, options.target);
  if (!resolution.ok) return resolution;
  return {
    manifest: await buildManifest(productDir, snapshot, resolution.node, includePath),
    ok: true,
  };
}

function appendList(lines: string[], label: string, values: readonly string[]): void {
  lines.push(`${label}:`);
  for (const value of values) {
    lines.push(`${TEXT_LIST_INDENT}${value}`);
  }
}

export function renderSpecContextText(manifest: SpecContextManifest): string {
  const lines = [
    `${SPEC_CONTEXT_TEXT_LABEL.TARGET}: ${manifest.target}`,
    `${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${manifest.productDir}`,
    `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${manifest.methodology.version}`,
  ];
  appendList(
    lines,
    SPEC_CONTEXT_TEXT_LABEL.DOCUMENTS,
    manifest.documents.map((document) => `${document.role}: ${document.path}`),
  );
  appendList(lines, SPEC_CONTEXT_TEXT_LABEL.SAME_INDEX_SIBLINGS, manifest.siblings.sameIndex);
  appendList(lines, SPEC_CONTEXT_TEXT_LABEL.HIGHER_INDEX_SIBLINGS, manifest.siblings.higherIndex);
  return lines.join("\n");
}

export function renderSpecContextJson(manifest: SpecContextManifest): string {
  return JSON.stringify(manifest, null, JSON_INDENTATION);
}
