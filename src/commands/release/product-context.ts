import { posix } from "node:path";

import {
  RELEASE_CONTEXT_KIND,
  type ReleaseContextDocument,
  type ReleaseContextReader,
  type ReleaseEndpointPathOwnership,
  selectReleaseOwnershipContext,
} from "@/domains/release/product-context";
import { committedFileContent, committedPaths } from "@/lib/git/release";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import {
  extractDecisionCitations,
  readSpecTree,
  recognizeSpecTreeFilesystemEntry,
  resolveSpecTreePathOwnership,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND,
  specContextAncestors,
  specContextDecisions,
  specContextLowerIndexSiblings,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { type TestingRegistry, testingRegistry } from "@/test/registry";

const SPEC_TREE_DIRECTORY = "spx";
const TEST_LINK_PATTERN = /\[test\]\(([^)]+)\)/gu;
const INLINE_CODE_PATTERN = /`([^`]+)`/gu;
const AUDIT_TAG = "[audit";
const NOT_FOUND_ERROR_CODE = "ENOENT";

interface ReleaseContextEndpoint {
  readonly ref: string;
  readonly paths: readonly string[];
  readonly pathSet: ReadonlySet<string>;
  readonly source: SpecTreeSource;
  readonly snapshot: SpecTreeSnapshot;
}

export interface ReleaseProductContextDependencies {
  readonly git?: GitDependencies;
  readonly registry?: TestingRegistry;
}

/** Reads one product-context snapshot before any release agent is invoked. */
export const readReleaseProductContext: ReleaseContextReader = async (
  productDir,
  releaseData,
  dependencies: ReleaseProductContextDependencies = {},
) => {
  const git = dependencies.git ?? defaultGitDependencies;
  const registry = dependencies.registry ?? testingRegistry;
  const endpoints = await readReleaseEndpoints(productDir, releaseData, git);
  if (endpoints.every(({ snapshot }) => !hasSpecTree(snapshot))) return [];
  assertCompleteSpecTrees(endpoints);
  const selection = await resolveReleaseOwnershipSelection(productDir, releaseData, endpoints, registry);

  const documents = new Map<string, ReleaseContextDocument>();
  const documentSources = new Map<string, ReleaseContextEndpoint>();
  const addDocument = async (
    endpoint: ReleaseContextEndpoint,
    kind: ReleaseContextDocument["kind"],
    ref: SpecTreeSourceRef | undefined,
  ) => {
    if (ref?.path === undefined) throw new Error("Product context document has no filesystem path");
    if (documents.has(ref.path)) return;
    const readText = endpoint.source.readText;
    if (readText === undefined) throw new Error("Product context source cannot read documents");
    documents.set(ref.path, { kind, path: ref.path, content: await readText(ref) });
    documentSources.set(ref.path, endpoint);
  };

  const preferred = endpoints.find(({ snapshot }) => snapshot.product !== null);
  if (preferred === undefined || preferred.snapshot.product === null) return [];
  await addProductDocuments(preferred, addDocument);
  await addSelectedNodeDocuments(endpoints, releaseData.changedPaths, selection.nodeIds, addDocument);
  for (const endpoint of endpoints) {
    await addCitedDecisions(endpoint, documents, documentSources, addDocument);
  }
  return Object.values(RELEASE_CONTEXT_KIND).flatMap((kind) =>
    [...documents.values()].filter((document) => document.kind === kind)
  );
};

async function readReleaseEndpoints(
  productDir: string,
  releaseData: Parameters<ReleaseContextReader>[1],
  git: GitDependencies,
): Promise<readonly ReleaseContextEndpoint[]> {
  const current = await readEndpoint(productDir, releaseData.releaseRef, git);
  if (releaseData.previousTag === null) return [current];
  return [current, await readEndpoint(productDir, releaseData.previousTag, git)];
}

function assertCompleteSpecTrees(endpoints: readonly ReleaseContextEndpoint[]): void {
  const incomplete = endpoints.find(({ snapshot }) => hasSpecTree(snapshot) && snapshot.product === null);
  if (incomplete !== undefined) throw new Error(`Spec tree at ${incomplete.ref} has no product specification`);
}

async function resolveReleaseOwnershipSelection(
  productDir: string,
  releaseData: Parameters<ReleaseContextReader>[1],
  endpoints: readonly ReleaseContextEndpoint[],
  registry: TestingRegistry,
) {
  const endpointOwnership = (
    await Promise.all(
      endpoints.map((endpoint) => resolveEndpointOwnership(productDir, endpoint, releaseData.changedPaths, registry)),
    )
  ).flat();
  const selection = selectReleaseOwnershipContext(releaseData.changedPaths, endpointOwnership);
  if (selection.unresolvedPaths.length > 0) {
    throw new Error(`Unresolved release implementation paths: ${selection.unresolvedPaths.join(", ")}`);
  }
  return selection;
}

async function addProductDocuments(
  endpoint: ReleaseContextEndpoint,
  addDocument: ContextDocumentAdder,
): Promise<void> {
  if (endpoint.snapshot.product === null) return;
  await addDocument(endpoint, RELEASE_CONTEXT_KIND.PRODUCT, endpoint.snapshot.product.ref);
  for (const decision of specContextDecisions(endpoint.snapshot, [])) {
    await addDocument(endpoint, RELEASE_CONTEXT_KIND.DECISION, decision.ref);
  }
}

async function addSelectedNodeDocuments(
  endpoints: readonly ReleaseContextEndpoint[],
  changedPaths: readonly string[],
  selectedNodeIds: readonly string[],
  addDocument: ContextDocumentAdder,
): Promise<void> {
  const selected = new Set(selectedNodeIds);
  for (const endpoint of endpoints) {
    const targets = uniqueNodes([
      ...changedContextTargets(endpoint.snapshot, changedPaths),
      ...endpoint.snapshot.allNodes.filter((node) => selected.has(node.id)),
    ]);
    for (const target of targets) await addTargetDocuments(endpoint, target, addDocument);
  }
}

async function addTargetDocuments(
  endpoint: ReleaseContextEndpoint,
  target: SpecTreeNode,
  addDocument: ContextDocumentAdder,
): Promise<void> {
  const contextNodes = [...specContextAncestors(endpoint.snapshot, target), target];
  for (const decision of specContextDecisions(endpoint.snapshot, contextNodes)) {
    await addDocument(endpoint, RELEASE_CONTEXT_KIND.DECISION, decision.ref);
  }
  for (const node of [...contextNodes, ...specContextLowerIndexSiblings(endpoint.snapshot, contextNodes)]) {
    await addDocument(endpoint, RELEASE_CONTEXT_KIND.SPECIFICATION, node.ref);
  }
}

type ContextDocumentAdder = (
  endpoint: ReleaseContextEndpoint,
  kind: ReleaseContextDocument["kind"],
  ref: SpecTreeSourceRef | undefined,
) => Promise<void>;

async function readEndpoint(
  productDir: string,
  ref: string,
  git: GitDependencies,
): Promise<ReleaseContextEndpoint> {
  const paths = await committedPaths(ref, productDir, git);
  const source = createCommittedSpecTreeSource(productDir, ref, paths, git);
  return {
    ref,
    paths,
    pathSet: new Set(paths),
    source,
    snapshot: await readSpecTree({ source }),
  };
}

function createCommittedSpecTreeSource(
  productDir: string,
  ref: string,
  paths: readonly string[],
  git: GitDependencies,
): SpecTreeSource {
  return {
    entries: () => committedSpecTreeEntries(paths),
    async readText(sourceRef): Promise<string> {
      if (sourceRef.path === undefined) throw new Error("Committed source refs require a path");
      const content = await committedFileContent(ref, sourceRef.path, productDir, git);
      if (content === null) throw missingCommittedFile(sourceRef.path, ref);
      return content;
    },
  };
}

async function* committedSpecTreeEntries(paths: readonly string[]): AsyncIterable<SpecTreeSourceEntry> {
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

async function* walkCommittedDirectory(
  directory: string,
  parentId: string | undefined,
  directories: ReadonlySet<string>,
  files: ReadonlySet<string>,
): AsyncIterable<SpecTreeSourceEntry> {
  const children = [
    ...[...directories].filter((path) => parentDirectory(path) === directory).map((path) => ({
      path,
      directory: true,
    })),
    ...[...files].filter((path) => parentDirectory(path) === directory).map((path) => ({ path, directory: false })),
  ].sort((left, right) => posix.basename(left.path).localeCompare(posix.basename(right.path)));

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

async function resolveEndpointOwnership(
  productDir: string,
  endpoint: ReleaseContextEndpoint,
  changedPaths: readonly string[],
  registry: TestingRegistry,
): Promise<readonly ReleaseEndpointPathOwnership[]> {
  const linkedOwners = await linkedEvidenceOwners(endpoint);
  const auditOwners = await auditDeclarationOwners(endpoint, changedPaths);
  return Promise.all(
    changedPaths.map((path) =>
      resolveEndpointPathOwnership(productDir, endpoint, path, registry, linkedOwners, auditOwners.get(path) ?? [])
    ),
  );
}

async function resolveEndpointPathOwnership(
  productDir: string,
  endpoint: ReleaseContextEndpoint,
  path: string,
  registry: TestingRegistry,
  linkedOwners: ReadonlyMap<string, string>,
  auditOwners: readonly string[],
): Promise<ReleaseEndpointPathOwnership> {
  const claimedNodeIds = new Set(auditOwners);
  const related = await relatedEvidenceClaims(productDir, endpoint, path, registry);
  for (const testPath of related.testPaths) {
    const owner = linkedOwners.get(testPath);
    if (owner !== undefined) claimedNodeIds.add(owner);
  }
  if (!related.classifiedAsSource) return { path, classifiedAsSource: false, candidateNodeIds: [] };
  return reduceEndpointClaims(endpoint.snapshot, path, [...claimedNodeIds]);
}

async function relatedEvidenceClaims(
  productDir: string,
  endpoint: ReleaseContextEndpoint,
  path: string,
  registry: TestingRegistry,
): Promise<{ readonly classifiedAsSource: boolean; readonly testPaths: readonly string[] }> {
  let classifiedAsSource = false;
  const testPaths = new Set<string>();
  for (const language of registry.languages) {
    const resolution = await resolveLanguageClaims(productDir, endpoint, path, language);
    if (resolution === null) continue;
    if (resolution.resolvedSourcePaths.includes(path)) classifiedAsSource = true;
    for (const testPath of resolution.testPaths) testPaths.add(testPath);
  }
  return { classifiedAsSource, testPaths: [...testPaths] };
}

async function resolveLanguageClaims(
  productDir: string,
  endpoint: ReleaseContextEndpoint,
  path: string,
  language: TestingRegistry["languages"][number],
) {
  if (language.relatedTestPaths === undefined) return null;
  const candidateTestPaths = endpoint.paths.filter((candidate) => language.matchesTestFile(candidate));
  if (candidateTestPaths.length === 0) return null;
  try {
    return await language.relatedTestPaths(
      { productDir, sourcePaths: [path], candidateTestPaths, baseRef: endpoint.ref },
      {
        isLanguagePresent: () => true,
        readFile: (candidate) => readCommittedPath(endpoint, candidate),
        runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "unsupported" }),
      },
    );
  } catch (error) {
    if (!hasErrorCode(error, NOT_FOUND_ERROR_CODE)) throw error;
    return null;
  }
}

function reduceEndpointClaims(
  snapshot: SpecTreeSnapshot,
  path: string,
  claimedNodeIds: readonly string[],
): ReleaseEndpointPathOwnership {
  const ownership = resolveSpecTreePathOwnership(snapshot, path, claimedNodeIds);
  if (ownership.kind === SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED) {
    return { path, classifiedAsSource: true, candidateNodeIds: [] };
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

async function linkedEvidenceOwners(endpoint: ReleaseContextEndpoint): Promise<ReadonlyMap<string, string>> {
  const owners = new Map<string, string>();
  for (const node of endpoint.snapshot.allNodes) {
    if (node.ref?.path === undefined) continue;
    const content = await readCommittedPath(endpoint, node.ref.path);
    for (const match of content.matchAll(TEST_LINK_PATTERN)) {
      const linkedPath = match[1];
      owners.set(posix.normalize(posix.join(posix.dirname(node.ref.path), linkedPath)), node.id);
    }
  }
  return owners;
}

async function auditDeclarationOwners(
  endpoint: ReleaseContextEndpoint,
  changedPaths: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const owners = new Map<string, Set<string>>();
  const declarations = [
    ...endpoint.snapshot.allNodes.flatMap((node) =>
      node.ref?.path === undefined ? [] : [{ path: node.ref.path, owner: node.id }]
    ),
    ...endpoint.snapshot.decisions.flatMap((decision) =>
      decision.ref?.path === undefined || decision.parentId === undefined
        ? []
        : [{ path: decision.ref.path, owner: decision.parentId }]
    ),
  ];
  for (const declaration of declarations) {
    const content = await readCommittedPath(endpoint, declaration.path);
    for (const line of content.split("\n")) {
      if (!line.includes(AUDIT_TAG)) continue;
      const references = new Set([...line.matchAll(INLINE_CODE_PATTERN)].map((match) => match[1]));
      for (const path of changedPaths) {
        if (!references.has(path)) continue;
        const pathOwners = owners.get(path) ?? new Set<string>();
        pathOwners.add(declaration.owner);
        owners.set(path, pathOwners);
      }
    }
  }
  return new Map([...owners].map(([path, pathOwners]) => [path, [...pathOwners]]));
}

async function readCommittedPath(endpoint: ReleaseContextEndpoint, path: string): Promise<string> {
  const readText = endpoint.source.readText;
  if (readText === undefined || !endpoint.pathSet.has(path)) throw missingCommittedFile(path, endpoint.ref);
  return readText({ id: path, path });
}

function missingCommittedFile(path: string, ref: string): Error {
  const error = new Error(`Committed path ${path} does not exist at ${ref}`);
  Object.defineProperty(error, "code", { value: NOT_FOUND_ERROR_CODE, enumerable: true });
  return error;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { readonly code?: unknown }).code === code;
}

function hasSpecTree(snapshot: SpecTreeSnapshot): boolean {
  return snapshot.product !== null || snapshot.allNodes.length > 0 || snapshot.decisions.length > 0;
}

function uniqueNodes(nodes: readonly SpecTreeNode[]): readonly SpecTreeNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

async function addCitedDecisions(
  endpoint: ReleaseContextEndpoint,
  documents: ReadonlyMap<string, ReleaseContextDocument>,
  documentSources: ReadonlyMap<string, ReleaseContextEndpoint>,
  addDocument: (
    endpoint: ReleaseContextEndpoint,
    kind: ReleaseContextDocument["kind"],
    ref: SpecTreeSourceRef | undefined,
  ) => Promise<void>,
): Promise<void> {
  const decisionsByPath = new Map(endpoint.snapshot.decisions.map((decision) => [decision.ref?.path, decision.ref]));
  for (const document of documents.values()) {
    if (documentSources.get(document.path) !== endpoint) continue;
    for (const citation of extractDecisionCitations(document.content)) {
      const ref = decisionsByPath.get(citation);
      if (ref === undefined) {
        throw new Error(`Unresolved product-context decision ${citation} cited by ${document.path}`);
      }
      await addDocument(endpoint, RELEASE_CONTEXT_KIND.DECISION, ref);
    }
  }
}

function changedContextTargets(snapshot: SpecTreeSnapshot, changedPaths: readonly string[]): readonly SpecTreeNode[] {
  return snapshot.allNodes.filter((node) => {
    const path = node.ref?.path;
    return path !== undefined && changedPaths.some((changed) => changed.startsWith(`${posix.dirname(path)}/`));
  });
}
