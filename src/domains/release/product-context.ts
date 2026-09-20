import { posix } from "node:path";

import {
  compareSpecContextOrdinal,
  recognizeSpecTreeFilesystemEntry,
  resolveSpecTreePathOwnership,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";

import { encodeReleasePromptData } from "./prompt-data";
import type { ReleaseData } from "./release-data";

const SPEC_TREE_DIRECTORY = "spx";
const TEST_LINK_PATTERN = /\[test\]\(([^)]+)\)/gu;
const INLINE_CODE_PATTERN = /`([^`]+)`/gu;
const AUDIT_TAG = "[audit";

export const RELEASE_CONTEXT_KIND = {
  PRODUCT: "product",
  DECISION: "decision",
  SPECIFICATION: "specification",
} as const;

export interface ReleaseContextDocument {
  readonly kind: (typeof RELEASE_CONTEXT_KIND)[keyof typeof RELEASE_CONTEXT_KIND];
  readonly path: string;
  readonly content: string;
}

export type ReleaseProductContext = readonly ReleaseContextDocument[];

export interface ReleaseEndpointPathOwnership {
  readonly path: string;
  readonly classifiedAsSource: boolean;
  readonly candidateNodeIds: readonly string[];
  readonly governingNodeId?: string;
  /** The product root governs the path: a root decision claims it and no node candidate exists. */
  readonly governedByProduct?: boolean;
}

export interface ReleaseOwnershipContextSelection {
  readonly nodeIds: readonly string[];
  readonly unresolvedPaths: readonly string[];
}

export interface ReleaseSourceInput {
  readonly releaseData: ReleaseData;
  readonly productContext?: ReleaseProductContext;
}

export type ReleaseContextReader = (
  productDir: string,
  releaseData: ReleaseData,
) => Promise<ReleaseProductContext>;

export const RELEASE_SOURCE_DATA_BLOCK_OPEN = "<release-source>";
export const RELEASE_SOURCE_DATA_BLOCK_CLOSE = "</release-source>";

export function selectReleaseOwnershipContext(
  changedPaths: readonly string[],
  endpointOwnership: readonly ReleaseEndpointPathOwnership[],
): ReleaseOwnershipContextSelection {
  const nodeIds = new Set<string>();
  const unresolvedPaths: string[] = [];
  for (const path of changedPaths) {
    const endpointResults = endpointOwnership.filter((result) => result.path === path);
    if (!endpointResults.some((result) => result.classifiedAsSource)) continue;
    const resolved = endpointResults.filter((result) =>
      result.candidateNodeIds.length > 0 || result.governedByProduct === true
    );
    if (resolved.length === 0) {
      unresolvedPaths.push(path);
      continue;
    }
    for (const result of resolved) {
      for (const candidateNodeId of result.candidateNodeIds) nodeIds.add(candidateNodeId);
      if (result.governingNodeId !== undefined) nodeIds.add(result.governingNodeId);
    }
  }
  return { nodeIds: [...nodeIds], unresolvedPaths };
}

export function formatReleaseSourceInput(input: ReleaseSourceInput): string {
  return [
    RELEASE_SOURCE_DATA_BLOCK_OPEN,
    encodeReleasePromptData({ productContext: input.productContext ?? [], releaseData: input.releaseData }),
    RELEASE_SOURCE_DATA_BLOCK_CLOSE,
  ].join("\n");
}

/** A declaration document read from one release endpoint, paired with the node that owns it. */
export interface ReleaseEndpointDeclaration {
  readonly path: string;
  readonly ownerNodeId: string;
  readonly content: string;
}

/** Spec-tree source entries for the committed paths of one release endpoint, in ordinal order. */
export function* committedSpecTreeEntries(paths: readonly string[]): Iterable<SpecTreeSourceEntry> {
  const prefix = `${SPEC_TREE_DIRECTORY}/`;
  const files = paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
  const directories = new Set<string>();
  for (const file of files) {
    let directory = posix.dirname(file);
    while (directory !== ".") {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  yield* walkCommittedDirectory("", undefined, directories, new Set(files));
}

function* walkCommittedDirectory(
  directory: string,
  parentId: string | undefined,
  directories: ReadonlySet<string>,
  files: ReadonlySet<string>,
): Iterable<SpecTreeSourceEntry> {
  const children = [
    ...[...directories].filter((path) => parentDirectory(path) === directory).map((path) => ({
      path,
      directory: true,
    })),
    ...[...files].filter((path) => parentDirectory(path) === directory).map((path) => ({ path, directory: false })),
  ].sort((left, right) => compareSpecContextOrdinal(posix.basename(left.path), posix.basename(right.path)));

  for (const child of children) {
    const sourceEntry = recognizeSpecTreeFilesystemEntry({
      type: child.directory
        ? SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY
        : SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
      relativePath: child.path,
      ...(parentId === undefined ? {} : { parentId }),
    });
    if (sourceEntry !== null) yield sourceEntry;
    if (child.directory && (sourceEntry === null || sourceEntry.type === SPEC_TREE_ENTRY_TYPE.NODE)) {
      yield* walkCommittedDirectory(
        child.path,
        sourceEntry?.type === SPEC_TREE_ENTRY_TYPE.NODE ? sourceEntry.id : parentId,
        directories,
        files,
      );
    }
  }
}

function parentDirectory(path: string): string {
  const directory = posix.dirname(path);
  return directory === "." ? "" : directory;
}

/**
 * Reduces claimed identities for one source path into that endpoint's ownership record. A claim
 * carrying the product's own identity comes from a root decision and, with no node candidate,
 * attributes the path to the product root instead of leaving it unresolved.
 */
export function reduceEndpointClaims(
  snapshot: SpecTreeSnapshot,
  path: string,
  claimedNodeIds: readonly string[],
): ReleaseEndpointPathOwnership {
  const ownership = resolveSpecTreePathOwnership(snapshot, path, claimedNodeIds);
  if (ownership.kind === SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED) {
    const rootClaim = snapshot.product !== null && claimedNodeIds.includes(snapshot.product.id);
    return { path, classifiedAsSource: true, candidateNodeIds: [], ...(rootClaim ? { governedByProduct: true } : {}) };
  }
  const governingNodeId = snapshot.allNodes.some(({ id }) => id === ownership.governingOwner.id)
    ? ownership.governingOwner.id
    : undefined;
  return {
    path,
    classifiedAsSource: true,
    candidateNodeIds: ownership.candidates.map(({ id }) => id),
    ...(governingNodeId === undefined ? {} : { governingNodeId }),
  };
}

/** Maps each linked test path to the node whose specification links it. */
export function linkedTestOwners(specifications: readonly ReleaseEndpointDeclaration[]): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const specification of specifications) {
    for (const match of specification.content.matchAll(TEST_LINK_PATTERN)) {
      const linkedPath = match[1];
      owners.set(posix.normalize(posix.join(posix.dirname(specification.path), linkedPath)), specification.ownerNodeId);
    }
  }
  return owners;
}

/** Maps each changed path an audit declaration names in inline code to the nodes declaring it. */
export function auditDeclarationOwners(
  declarations: readonly ReleaseEndpointDeclaration[],
  changedPaths: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const owners = new Map<string, Set<string>>();
  for (const declaration of declarations) {
    for (const line of declaration.content.split("\n")) {
      if (!line.includes(AUDIT_TAG)) continue;
      const references = new Set([...line.matchAll(INLINE_CODE_PATTERN)].map((match) => match[1]));
      for (const path of changedPaths) {
        if (!references.has(path)) continue;
        const pathOwners = owners.get(path) ?? new Set<string>();
        pathOwners.add(declaration.ownerNodeId);
        owners.set(path, pathOwners);
      }
    }
  }
  return new Map([...owners].map(([path, pathOwners]) => [path, [...pathOwners]]));
}

/** Nodes whose own directory holds a changed path. */
export function changedContextTargets(
  snapshot: SpecTreeSnapshot,
  changedPaths: readonly string[],
): readonly SpecTreeNode[] {
  return snapshot.allNodes.filter((node) => {
    const path = node.ref?.path;
    return path !== undefined && changedPaths.some((changed) => changed.startsWith(`${posix.dirname(path)}/`));
  });
}

export function uniqueNodes(nodes: readonly SpecTreeNode[]): readonly SpecTreeNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

export function hasSpecTree(snapshot: SpecTreeSnapshot): boolean {
  return snapshot.product !== null || snapshot.allNodes.length > 0 || snapshot.decisions.length > 0;
}

/** Orders context documents by kind — product, decisions, specifications — preserving insertion order within a kind. */
export function orderReleaseContextDocuments(documents: Iterable<ReleaseContextDocument>): ReleaseProductContext {
  const all = [...documents];
  return Object.values(RELEASE_CONTEXT_KIND).flatMap((kind) => all.filter((document) => document.kind === kind));
}
