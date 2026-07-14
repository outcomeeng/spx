import { expect } from "vitest";

import {
  createFilesystemSpecTreeSource,
  getKindDefinition,
  KIND_REGISTRY,
  type NodeKind,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import {
  sampleDecisionKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

type NodeSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
  readonly childCount: number;
};

type DecisionSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
};

type NodeDirectoryEntry = {
  readonly kind: NodeKind;
  readonly order: number;
  readonly slug: string;
};

export async function assertFilesystemAndMemorySourcesProjectEquivalently(): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    const filesystemProjection = projectSpecTree(await readSpecTree({ source: env.filesystemSource() }));
    const inMemoryProjection = await env.projectMemory();
    expect(expectPresent(filesystemProjection.product).title).toBe(expectPresent(inMemoryProjection.product).title);
    expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(inMemoryProjection));
    expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(inMemoryProjection));
  });
}

export async function assertFilesystemSourceUsesProductRelativeRefsAndInclusion(): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    const excludedDirectories = [
      nodeDirectoryName(env.fixture.peer),
      `${nodeDirectoryName(env.fixture.root)}/${nodeDirectoryName(env.fixture.child)}`,
    ];
    const includedDirectory = nodeDirectoryName(env.fixture.root);
    const includedText = await env.readFile(
      `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${includedDirectory}/${env.fixture.root.slug}.md`,
    );
    const source = createFilesystemSpecTreeSource({
      productDir: env.productDir,
      includePath: (path) => excludedDirectories.every((directory) => !path.includes(directory)),
    });
    const snapshot = await readSpecTree({ source });
    const ref = expectPresent(snapshot.allNodes[0]).ref;
    if (source.readText === undefined || ref === undefined) {
      throw new Error("Filesystem source evidence expected a readable source ref");
    }
    expect(snapshot.allNodes.map((node) => node.id)).toEqual([includedDirectory]);
    expect(ref.path).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${includedDirectory}/${env.fixture.root.slug}.md`);
    await expect(source.readText(ref)).resolves.toBe(includedText);
  });
}

export async function assertFilesystemSourceMapsEvidenceRecords(): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    const rootDirectory = nodeDirectoryName(env.fixture.root);
    const evidenceFiles = Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS).map((tail) => evidenceFileName(tail));
    const nonEvidenceSuffix = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY));
    const firstEvidenceFile = expectPresent(evidenceFiles[0]);
    const evidencePath = evidenceFilePath(rootDirectory, firstEvidenceFile);
    const ambiguousEvidencePath = evidenceFilePath(rootDirectory, ambiguousEvidenceFileName());
    for (const evidenceFile of evidenceFiles) await env.writeRaw(evidenceFilePath(rootDirectory, evidenceFile), "");
    await env.writeRaw(`${evidencePath}${nonEvidenceSuffix}`, "");
    await env.writeRaw(ambiguousEvidencePath, "");
    const snapshot = await readSpecTree({ source: env.filesystemSource() });
    const root = expectPresent(snapshot.allNodes.find((node) => node.id === rootDirectory));
    const evidence = snapshot.entries.filter(isEvidenceEntry);
    const expectedEvidenceIds = evidenceFiles.map((evidenceFile) =>
      `${rootDirectory}/${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}/${evidenceFile}`
    );
    const evidenceEntry = expectPresent(evidence.find((entry) => entry.id === expectedEvidenceIds[0]));
    expect(root.state).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
    expect(evidence).toHaveLength(evidenceFiles.length);
    expect(evidence.map((entry) => entry.id)).toEqual(expect.arrayContaining(expectedEvidenceIds));
    expect(evidenceEntry).toMatchObject({
      id: expectedEvidenceIds[0],
      parentId: rootDirectory,
      status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
    });
    expect(evidenceEntry.ref?.path).toBe(evidencePath);
  });
}

export async function assertFilesystemSourceDescendsThroughDecisionShapedDirectories(): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    const rootDirectory = nodeDirectoryName(env.fixture.root);
    const childDirectory = nodeDirectoryName(env.fixture.child);
    const decisionKind = sampleDecisionKind(KIND_REGISTRY);
    const decisionOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const decisionSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const decisionDirectory = `${decisionOrder}-${decisionSlug}${KIND_REGISTRY[decisionKind].suffix}`;
    const nestedChildId = `${rootDirectory}/${decisionDirectory}/${childDirectory}`;
    await env.writeRaw(
      [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        rootDirectory,
        decisionDirectory,
        childDirectory,
        `${env.fixture.child.slug}.md`,
      ].join("/"),
      "",
    );
    const snapshot = await readSpecTree({ source: env.filesystemSource() });
    expect(snapshot.decisions.map((decision) => decision.id)).not.toContain(`${rootDirectory}/${decisionDirectory}`);
    expect(snapshot.allNodes.map((node) => node.id)).toContain(nestedChildId);
  });
}

export async function assertFilesystemSourceRejectsDescendantsBelowUnregisteredDirectory(): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    const unregisteredDirectory = [
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder()),
      sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    ].join("-");
    const unregisteredSuffix = sampleSpecTreeTestValue(
      SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY),
    );
    const childDirectory = nodeDirectoryName(env.fixture.child);
    await env.writeRaw(
      [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        `${unregisteredDirectory}${unregisteredSuffix}`,
        childDirectory,
        `${env.fixture.child.slug}.md`,
      ].join("/"),
      "",
    );
    const snapshot = await readSpecTree({ source: env.filesystemSource() });
    expect(snapshot.allNodes.map((node) => node.id)).toEqual([]);
  });
}

function evidenceFilePath(rootDirectory: string, evidenceFile: string): string {
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, rootDirectory, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, evidenceFile].join(
    "/",
  );
}

function evidenceFileName(tail: readonly string[]): string {
  return [
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    sampleEvidenceMode(),
    sampleEvidenceLevel(),
    ...tail,
  ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
}

function ambiguousEvidenceFileName(): string {
  const mode = sampleEvidenceMode();
  const level = sampleEvidenceLevel();
  return [
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    mode,
    level,
    sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
    mode,
    level,
    ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT,
  ].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
}

function sampleEvidenceMode(): string {
  return expectPresent(SPEC_TREE_EVIDENCE_FILE.MODES[0]);
}

function sampleEvidenceLevel(): string {
  return expectPresent(SPEC_TREE_EVIDENCE_FILE.LEVELS[0]);
}

function nodeSignatures(projection: SpecTreeProjection): readonly NodeSignature[] {
  return flattenNodes(projection.nodes).map((node) => ({
    kind: node.kind,
    order: node.order,
    slug: node.slug,
    childCount: node.children.length,
  }));
}

function flattenNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function decisionSignatures(projection: SpecTreeProjection): readonly DecisionSignature[] {
  return projection.decisions.map((decision) => ({
    kind: decision.kind,
    order: decision.order,
    slug: decision.slug,
  }));
}

function isEvidenceEntry(entry: SpecTreeSourceEntry): entry is SpecTreeEvidenceSourceEntry {
  return entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE;
}

function nodeDirectoryName(node: NodeDirectoryEntry): string {
  return `${node.order}-${node.slug}${getKindDefinition(node.kind).suffix}`;
}
