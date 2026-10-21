import {
  auditDeclarationOwners,
  changedContextTargets,
  committedSpecTreeEntries,
  extractDecisionLinkCitations,
  hasSpecTree,
  linkedTestOwners,
  orderReleaseContextDocuments,
  reduceEndpointClaims,
  RELEASE_CONTEXT_KIND,
  type ReleaseContextDocument,
  type ReleaseEndpointDeclaration,
  type ReleaseEndpointPathOwnership,
  type ReleaseProductContext,
  selectReleaseOwnershipContext,
  uniqueNodes,
} from "@/domains/release/product-context";
import type { ReleaseData } from "@/domains/release/release-data";
import { committedFileContent, committedPaths } from "@/lib/git/release";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import {
  readSpecTree,
  resolveCommittedSpecTreeGrammarSelection,
  SPEC_TREE_ROOT_PREFIX,
  specContextAncestors,
  specContextDecisions,
  specContextLowerIndexSiblings,
  type SpecTreeGrammarSelection,
  specTreeLinkGrammar,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSource,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { type TestingRegistry, testingRegistry } from "@/test/registry";

const NOT_FOUND_ERROR_CODE = "ENOENT";

interface ReleaseContextEndpoint {
  readonly ref: string;
  readonly paths: readonly string[];
  readonly pathSet: ReadonlySet<string>;
  readonly source: SpecTreeSource;
  readonly snapshot: SpecTreeSnapshot;
  /** The grammar the endpoint's committed methodology declaration selects; absent when the endpoint commits no spec tree. */
  readonly selection?: SpecTreeGrammarSelection;
}

export interface ReleaseProductContextDependencies {
  readonly endpointReader?: ReleaseEndpointReader;
  readonly git?: GitDependencies;
  readonly registry?: TestingRegistry;
}

export interface ReleaseEndpointReader {
  readonly listPaths: (productDir: string, ref: string) => Promise<readonly string[]>;
  readonly readText: (productDir: string, ref: string, path: string) => Promise<string | null>;
}

/** Reads one product-context snapshot before any release agent is invoked. */
export async function readReleaseProductContext(
  productDir: string,
  releaseData: ReleaseData,
  dependencies: ReleaseProductContextDependencies = {},
): Promise<ReleaseProductContext> {
  const endpointReader = memoizeReleaseEndpointReader(
    dependencies.endpointReader ?? createGitReleaseEndpointReader(dependencies.git ?? defaultGitDependencies),
  );
  const registry = dependencies.registry ?? testingRegistry;
  const endpoints = await readReleaseEndpoints(productDir, releaseData, endpointReader);
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
  return orderReleaseContextDocuments(documents.values());
}

async function readReleaseEndpoints(
  productDir: string,
  releaseData: ReleaseData,
  endpointReader: ReleaseEndpointReader,
): Promise<readonly ReleaseContextEndpoint[]> {
  const current = await readEndpoint(productDir, releaseData.releaseRef, endpointReader);
  if (releaseData.previousTag === null) return [current];
  return [current, await readEndpoint(productDir, releaseData.previousTag, endpointReader)];
}

function assertCompleteSpecTrees(endpoints: readonly ReleaseContextEndpoint[]): void {
  const incomplete = endpoints.find(({ snapshot }) => hasSpecTree(snapshot) && snapshot.product === null);
  if (incomplete !== undefined) throw new Error(`Spec tree at ${incomplete.ref} has no product specification`);
}

async function resolveReleaseOwnershipSelection(
  productDir: string,
  releaseData: ReleaseData,
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
  endpointReader: ReleaseEndpointReader,
): Promise<ReleaseContextEndpoint> {
  const paths = await endpointReader.listPaths(productDir, ref);
  const selection = paths.some((path) => path.startsWith(SPEC_TREE_ROOT_PREFIX))
    ? await readEndpointGrammarSelection(productDir, ref, paths, endpointReader)
    : undefined;
  const source = createReleaseEndpointSpecTreeSource(productDir, ref, paths, endpointReader, selection);
  return {
    ref,
    paths,
    pathSet: new Set(paths),
    source,
    snapshot: await readSpecTree({ source }),
    ...(selection === undefined ? {} : { selection }),
  };
}

/**
 * The grammar selection of the methodology declaration the endpoint commits in its product
 * configuration. An endpoint that commits no declaration, or one the config module rejects,
 * selects no grammar and fails the release naming the endpoint.
 */
async function readEndpointGrammarSelection(
  productDir: string,
  ref: string,
  paths: readonly string[],
  endpointReader: ReleaseEndpointReader,
): Promise<SpecTreeGrammarSelection> {
  try {
    return await resolveCommittedSpecTreeGrammarSelection(productDir, {
      paths,
      readText: async (filename) => {
        const raw = await endpointReader.readText(productDir, ref, filename);
        if (raw === null) throw missingCommittedFile(filename, ref);
        return raw;
      },
    });
  } catch (error) {
    throw new Error(`Methodology declaration at ${ref}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createReleaseEndpointSpecTreeSource(
  productDir: string,
  ref: string,
  paths: readonly string[],
  endpointReader: ReleaseEndpointReader,
  selection: SpecTreeGrammarSelection | undefined,
): SpecTreeSource {
  const readCommittedText = async (path: string): Promise<string> => {
    const content = await endpointReader.readText(productDir, ref, path);
    if (content === null) throw missingCommittedFile(path, ref);
    return content;
  };
  return {
    async *entries() {
      if (selection !== undefined) yield* committedSpecTreeEntries(paths, selection, readCommittedText);
    },
    readText: async (sourceRef): Promise<string> => {
      if (sourceRef.path === undefined) throw new Error("Committed source refs require a path");
      return await readCommittedText(sourceRef.path);
    },
    ...(selection === undefined ? {} : { linkGrammar: async () => specTreeLinkGrammar(selection) }),
  };
}

function createGitReleaseEndpointReader(git: GitDependencies): ReleaseEndpointReader {
  return {
    listPaths: async (productDir, ref) => await committedPaths(ref, productDir, git),
    readText: async (productDir, ref, path) => await committedFileContent(ref, path, productDir, git),
  };
}

/** Reads each committed path once per endpoint, however many resolvers and documents ask for it. */
function memoizeReleaseEndpointReader(reader: ReleaseEndpointReader): ReleaseEndpointReader {
  const texts = new Map<string, Promise<string | null>>();
  return {
    listPaths: reader.listPaths,
    readText: (productDir, ref, path) => {
      const key = `${ref}\0${path}`;
      const memoized = texts.get(key) ?? reader.readText(productDir, ref, path);
      texts.set(key, memoized);
      return memoized;
    },
  };
}

async function resolveEndpointOwnership(
  productDir: string,
  endpoint: ReleaseContextEndpoint,
  changedPaths: readonly string[],
  registry: TestingRegistry,
): Promise<readonly ReleaseEndpointPathOwnership[]> {
  const nodeDeclarations = await readNodeDeclarations(endpoint);
  const linkedOwners = linkedTestOwners(nodeDeclarations);
  const auditOwners = auditDeclarationOwners(await readAuditDeclarations(endpoint, nodeDeclarations), changedPaths);
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

/**
 * Every node specification the endpoint commits, read once, owned by its node. A node directory
 * whose specification the endpoint does not commit contributes no declaration.
 */
async function readNodeDeclarations(endpoint: ReleaseContextEndpoint): Promise<readonly ReleaseEndpointDeclaration[]> {
  const declarations: ReleaseEndpointDeclaration[] = [];
  for (const node of endpoint.snapshot.allNodes) {
    if (node.ref?.path === undefined || !endpoint.pathSet.has(node.ref.path)) continue;
    declarations.push({
      path: node.ref.path,
      ownerNodeId: node.id,
      content: await readCommittedPath(endpoint, node.ref.path),
    });
  }
  return declarations;
}

/**
 * The node specifications plus every decision record at the endpoint, each decision owned by the
 * node whose subtree it governs; a root decision is owned by the product.
 */
async function readAuditDeclarations(
  endpoint: ReleaseContextEndpoint,
  nodeDeclarations: readonly ReleaseEndpointDeclaration[],
): Promise<readonly ReleaseEndpointDeclaration[]> {
  const decisions = endpoint.snapshot.decisions.flatMap((decision) => {
    const ownerNodeId = decision.parentId ?? endpoint.snapshot.product?.id;
    return decision.ref?.path === undefined || ownerNodeId === undefined
      ? []
      : [{ path: decision.ref.path, ownerNodeId }];
  });
  const declarations = [...nodeDeclarations];
  for (const decision of decisions) {
    declarations.push({ ...decision, content: await readCommittedPath(endpoint, decision.path) });
  }
  return declarations;
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

async function addCitedDecisions(
  endpoint: ReleaseContextEndpoint,
  documents: ReadonlyMap<string, ReleaseContextDocument>,
  documentSources: ReadonlyMap<string, ReleaseContextEndpoint>,
  addDocument: ContextDocumentAdder,
): Promise<void> {
  const decisionsByPath = new Map(endpoint.snapshot.decisions.map((decision) => [decision.ref?.path, decision.ref]));
  for (const document of documents.values()) {
    if (documentSources.get(document.path) !== endpoint) continue;
    if (endpoint.selection === undefined) continue;
    for (const citation of extractDecisionLinkCitations(document.path, document.content, endpoint.selection)) {
      const ref = decisionsByPath.get(citation);
      if (ref === undefined) {
        throw new Error(`Unresolved product-context decision ${citation} cited by ${document.path}`);
      }
      await addDocument(endpoint, RELEASE_CONTEXT_KIND.DECISION, ref);
    }
  }
}
