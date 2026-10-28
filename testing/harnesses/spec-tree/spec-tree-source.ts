/**
 * Observation helpers for the spec-tree source evidence: ordered-name and evidence-path
 * construction, trees written in the form a methodology line names, and projections of snapshots
 * into comparable signatures. The helpers return observations and names; every predicate lives in
 * the linked test.
 *
 * @module harnesses/spec-tree/spec-tree-source
 */

import {
  compareSpecContextOrdinal,
  getKindDefinition,
  renderSpecTreeRootFrontMatter,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNodeKind,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { evidenceFileNameFor, evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
import {
  orderIndexText,
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  type SpecTreeSourceForm,
} from "@testing/generators/spec-tree/spec-tree";
import type { CurrentSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

export type NodeSignature = {
  readonly kind: string;
  readonly order: readonly number[];
  readonly slug: string;
  readonly childCount: number;
};

export type DecisionSignature = {
  readonly kind: string;
  readonly order: readonly number[];
  readonly slug: string;
};

/** What links a recognized record to the rest of the tree, with every id replaced by the slug it names. */
export type NodeLinkSignature = {
  readonly slug: string;
  readonly parentSlug: string | undefined;
  readonly decisionSlugs: readonly string[];
  readonly evidenceCount: number;
};

export type DecisionLinkSignature = {
  readonly slug: string;
  readonly parentSlug: string | undefined;
};

export type NodeDirectoryEntry = {
  readonly kind: SpecTreeNodeKind;
  readonly orderSegments: readonly number[];
  readonly slug: string;
};

/** The names a tree written in a methodology line's form carries. */
export type SourceFormTree = {
  readonly productFile: string;
  readonly rootDirectory: string;
  readonly childDirectory: string;
  readonly peerDirectory: string;
  readonly decisionFile: string;
};

/** The path segments joined by the grammar's path separator. */
export function specTreePath(...segments: readonly string[]): string {
  return segments.join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

/** The product-root-relative path of the path segments below the tree root directory. */
export function productRelativePath(...segments: readonly string[]): string {
  return specTreePath(SPEC_TREE_CONFIG.ROOT_DIRECTORY, ...segments);
}

export function evidenceFilePath(nodePath: string, evidenceFile: string): string {
  return productRelativePath(nodePath, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFile);
}

export function evidenceFileName(tail: readonly string[]): string {
  return evidenceFileNameFor([
    evidenceSubject(sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 0)),
    sampleEvidenceMode(),
    sampleEvidenceLevel(),
  ], tail);
}

export function ambiguousEvidenceFileName(): string {
  const mode = sampleEvidenceMode();
  const level = sampleEvidenceLevel();
  return evidenceFileNameFor([
    evidenceSubject(sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 1)),
    mode,
    level,
    evidenceSubject(sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), 2)),
    mode,
    level,
  ], SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT);
}

function sampleEvidenceMode(): string {
  return SPEC_TREE_EVIDENCE_FILE.MODES[0];
}

function sampleEvidenceLevel(): string {
  return SPEC_TREE_EVIDENCE_FILE.LEVELS[0];
}

export function nodeSignatures(projection: SpecTreeProjection): readonly NodeSignature[] {
  return flattenNodes(projection.nodes).map((node) => ({
    kind: node.kind,
    order: node.order,
    slug: node.slug,
    childCount: node.children.length,
  }));
}

export function flattenNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

export function decisionSignatures(projection: SpecTreeProjection): readonly DecisionSignature[] {
  return projection.decisions.map((decision) => ({
    kind: decision.kind,
    order: decision.order,
    slug: decision.slug,
  }));
}

/** Each recognized node's parent, decisions, and linked evidence, named by slug and sorted by slug. */
export function nodeLinkSignatures(snapshot: SpecTreeSnapshot): readonly NodeLinkSignature[] {
  const slugById = new Map(snapshot.allNodes.map((node) => [node.id, node.slug]));
  const evidence = snapshot.entries.filter(isEvidenceEntry);
  return snapshot.allNodes
    .map((node) => ({
      slug: node.slug,
      parentSlug: node.parentId === undefined ? undefined : slugById.get(node.parentId),
      decisionSlugs: node.decisions.map((decision) => decision.slug),
      evidenceCount: evidence.filter((entry) => entry.parentId === node.id).length,
    }))
    .sort((left, right) => compareSpecContextOrdinal(left.slug, right.slug));
}

/** Each recognized decision's parent node, named by slug and sorted by slug. */
export function decisionLinkSignatures(snapshot: SpecTreeSnapshot): readonly DecisionLinkSignature[] {
  const slugById = new Map(snapshot.allNodes.map((node) => [node.id, node.slug]));
  return snapshot.decisions
    .map((decision) => ({
      slug: decision.slug,
      parentSlug: decision.parentId === undefined ? undefined : slugById.get(decision.parentId),
    }))
    .sort((left, right) => compareSpecContextOrdinal(left.slug, right.slug));
}

export function isEvidenceEntry(entry: SpecTreeSourceEntry): entry is SpecTreeEvidenceSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE;
}

/** An ordered directory or file name: the index, the order separator, the slug, and the suffix. */
export function orderedName(orderSegments: readonly number[], slug: string, suffix: string): string {
  return `${orderIndexText(orderSegments)}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`;
}

export function nodeDirectoryName(node: NodeDirectoryEntry): string {
  return orderedName(node.orderSegments, node.slug, getKindDefinition(node.kind).suffix);
}

export function decisionFileName(decision: RepresentativeSpecTreeFixture["decision"]): string {
  return orderedName(decision.orderSegments, decision.slug, getKindDefinition(decision.kind).suffix);
}

/** One evidence file under each of the fixture's child and peer nodes, as the fixture's evidence entries name them. */
export async function writeFixtureEvidence(env: CurrentSpecTreeEnv): Promise<void> {
  const rootDirectory = nodeDirectoryName(env.fixture.root);
  const childPath = specTreePath(rootDirectory, nodeDirectoryName(env.fixture.child));
  const peerPath = nodeDirectoryName(env.fixture.peer);
  const [tail] = Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS);
  await env.writeRaw(evidenceFilePath(childPath, evidenceFileName(tail)), "");
  await env.writeRaw(evidenceFilePath(peerPath, evidenceFileName(tail)), "");
}

/**
 * Writes the fixture's product, root node with a nested child, peer node, and decision in the form
 * a methodology line names: its product file suffix, its spec file suffix, its node directory
 * suffixes, and the front matter a root spec declares its kind in when the form requires it.
 */
export async function writeSourceFormTree(
  env: CurrentSpecTreeEnv,
  form: SpecTreeSourceForm,
): Promise<SourceFormTree> {
  const { product, root, child, peer, decision } = env.fixture;
  const tree: SourceFormTree = {
    productFile: `${product.title}${form.productSuffix}`,
    rootDirectory: orderedName(root.orderSegments, root.slug, form.rootSuffix),
    childDirectory: orderedName(child.orderSegments, child.slug, form.childSuffix),
    peerDirectory: orderedName(peer.orderSegments, peer.slug, form.peerSuffix),
    decisionFile: decisionFileName(decision),
  };
  const body = `# ${product.title}\n`;
  await env.writeRaw(
    productRelativePath(tree.productFile),
    form.productDeclaresKind ? `${renderSpecTreeRootFrontMatter()}\n${body}` : body,
  );
  await env.writeRaw(productRelativePath(tree.rootDirectory, `${root.slug}${form.specFileSuffix}`), body);
  await env.writeRaw(
    productRelativePath(tree.rootDirectory, tree.childDirectory, `${child.slug}${form.specFileSuffix}`),
    body,
  );
  await env.writeRaw(productRelativePath(tree.peerDirectory, `${peer.slug}${form.specFileSuffix}`), body);
  await env.writeRaw(productRelativePath(tree.rootDirectory, tree.decisionFile), body);
  return tree;
}

/**
 * Writes the environment's fixture in the form a methodology line names, each node directory
 * taking the suffix its fixture kind carries.
 */
export async function writeFixtureTree(
  env: CurrentSpecTreeEnv,
  form: SpecTreeSourceForm,
): Promise<SourceFormTree> {
  const { root, child, peer } = env.fixture;
  return writeSourceFormTree(env, {
    ...form,
    rootSuffix: getKindDefinition(root.kind).suffix,
    childSuffix: getKindDefinition(child.kind).suffix,
    peerSuffix: getKindDefinition(peer.kind).suffix,
  });
}
