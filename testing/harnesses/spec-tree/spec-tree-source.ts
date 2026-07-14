import { expect, it } from "vitest";

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
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { NAMING_SCHEMA_VERSION_TEST_GENERATOR } from "@testing/generators/spec-tree/naming-schema-version";
import {
  orderedDirectoryName,
  type RecognizedSpecTreeSourceEntryRole,
  sampleDecisionKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_SOURCE_MAPPING_CASE_KIND,
  SPEC_TREE_TEST_GENERATOR,
  type SpecTreeSourceMappingCase,
  specTreeSourceMappingCases,
  type SupersededNodeSuffixCase,
  supersededNodeSuffixCases,
} from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";
import { withSpecTreeEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

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

const PARAMETERIZED_CASE_TITLE = "$title";

export function registerSpecTreeSourceMappingEvidence(): void {
  it.each(specTreeSourceMappingCases())(PARAMETERIZED_CASE_TITLE, assertSpecTreeSourceMappingCase);
}

export function registerSpecTreeSourcePropertyEvidence(): void {
  it(
    "projects every generated valid tree equivalently from filesystem and memory sources",
    assertFilesystemAndMemorySourcesProjectEquivalently,
  );
  it(
    "rejects registered descendants below every generated invalid ordered directory",
    assertFilesystemSourceRejectsDescendantsBelowUnregisteredDirectory,
  );
}

export function registerResidualRetentionMappingEvidence(): void {
  it.each(supersededNodeSuffixCases())(PARAMETERIZED_CASE_TITLE, assertSupersededNodeSuffixCase);
}

export function registerResidualRetentionPropertyEvidence(): void {
  it("retains every generated invalid ordered directory", assertInvalidOrderedDirectoryRetentionProperty);
  it(
    "classifies every generated demoted registry suffix through the injected version set",
    assertInjectedVersionSetProperty,
  );
}

export async function assertSpecTreeSourceMappingCase(testCase: SpecTreeSourceMappingCase): Promise<void> {
  switch (testCase.kind) {
    case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.PRODUCT_RELATIVE_REFS:
      await assertFilesystemSourceUsesProductRelativeRefsAndInclusion();
      return;
    case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.RECOGNIZED_ENTRY_ROLE:
      await assertFilesystemSourceMapsRecognizedEntryRole(testCase.entryType);
      return;
    case SPEC_TREE_SOURCE_MAPPING_CASE_KIND.DECISION_SHAPED_DESCENT:
      await assertFilesystemSourceDescendsThroughDecisionShapedDirectories();
  }
}

export async function assertFilesystemAndMemorySourcesProjectEquivalently(): Promise<void> {
  await assertProperty(
    SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
    async (fixture) => {
      await withSpecTreeEnv({}, async (env) => {
        await env.materialize();
        const filesystemProjection = projectSpecTree(await readSpecTree({ source: env.filesystemSource() }));
        const inMemoryProjection = await env.projectMemory();
        expect(expectPresent(filesystemProjection.product).title).toBe(
          expectPresent(inMemoryProjection.product).title,
        );
        expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(inMemoryProjection));
        expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(inMemoryProjection));
      }, { fixture });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
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

export async function assertFilesystemSourceMapsRecognizedEntryRole(
  entryType: RecognizedSpecTreeSourceEntryRole,
): Promise<void> {
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    const rootDirectory = nodeDirectoryName(env.fixture.root);
    const snapshot = await readSpecTree({ source: env.filesystemSource() });
    switch (entryType) {
      case SPEC_TREE_ENTRY_TYPE.PRODUCT:
        expect(expectPresent(snapshot.product).ref?.path).toContain(SPEC_TREE_CONFIG.PRODUCT.SUFFIX);
        return;
      case SPEC_TREE_ENTRY_TYPE.NODE: {
        const root = expectPresent(snapshot.allNodes.find((node) => node.id === rootDirectory));
        expect(root.id).toBe(rootDirectory);
        expect(root.ref?.path).toContain(rootDirectory);
        return;
      }
      case SPEC_TREE_ENTRY_TYPE.DECISION:
        expect(expectPresent(snapshot.decisions[0])).toMatchObject({ parentId: rootDirectory });
        expect(expectPresent(snapshot.decisions[0]).ref?.path).toContain(rootDirectory);
        return;
      case SPEC_TREE_ENTRY_TYPE.EVIDENCE: {
        const evidenceFiles = Object.values(SPEC_TREE_EVIDENCE_FILE.TAILS).map((tail) => evidenceFileName(tail));
        const nonEvidenceSuffix = sampleSpecTreeTestValue(
          SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY),
        );
        const firstEvidenceFile = expectPresent(evidenceFiles[0]);
        const evidencePath = evidenceFilePath(rootDirectory, firstEvidenceFile);
        const ambiguousEvidencePath = evidenceFilePath(rootDirectory, ambiguousEvidenceFileName());
        for (const evidenceFile of evidenceFiles) {
          await env.writeRaw(evidenceFilePath(rootDirectory, evidenceFile), "");
        }
        await env.writeRaw(`${evidencePath}${nonEvidenceSuffix}`, "");
        await env.writeRaw(ambiguousEvidencePath, "");
        const evidenceSnapshot = await readSpecTree({ source: env.filesystemSource() });
        const evidence = evidenceSnapshot.entries.filter(isEvidenceEntry);
        const expectedEvidenceIds = evidenceFiles.map((evidenceFile) =>
          `${rootDirectory}/${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}/${evidenceFile}`
        );
        const evidenceEntry = expectPresent(evidence.find((entry) => entry.id === expectedEvidenceIds[0]));
        expect(evidence).toHaveLength(evidenceFiles.length);
        expect(evidence.map((entry) => entry.id)).toEqual(expect.arrayContaining(expectedEvidenceIds));
        expect(evidenceEntry).toMatchObject({
          id: expectedEvidenceIds[0],
          parentId: rootDirectory,
          status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
        });
        expect(evidenceEntry.ref?.path).toBe(evidencePath);
      }
    }
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
  await assertProperty(
    SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectory(KIND_REGISTRY),
    async (invalidDirectory) => {
      await withSpecTreeEnv({}, async (env) => {
        const childDirectory = nodeDirectoryName(env.fixture.child);
        await env.writeRaw(
          [
            SPEC_TREE_CONFIG.ROOT_DIRECTORY,
            invalidDirectory,
            childDirectory,
            `${env.fixture.child.slug}.md`,
          ].join("/"),
          "",
        );
        const snapshot = await readSpecTree({ source: env.filesystemSource() });
        expect(snapshot.allNodes.map((node) => node.id)).toEqual([]);
      });
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export async function assertSupersededNodeSuffixCase(testCase: SupersededNodeSuffixCase): Promise<void> {
  const supersededDirectory = orderedDirectoryName(testCase.suffix);
  await withSpecTreeEnv({}, async (env) => {
    await env.materialize();
    await writeOrderedDirectory(env, supersededDirectory);
    const snapshot = await readSpecTree({ source: env.filesystemSource() });
    const superseded = expectPresent(snapshot.superseded.find((entry) => entry.id === supersededDirectory));
    expect(superseded.version).toBe(testCase.version);
    expect(snapshot.allNodes.map((node) => node.id)).not.toContain(supersededDirectory);
  });
}

export async function assertInvalidOrderedDirectoryRetentionProperty(): Promise<void> {
  await assertProperty(
    SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectory(KIND_REGISTRY),
    async (invalidDirectory) => {
      await withSpecTreeEnv({}, async (env) => {
        await env.materialize();
        await writeOrderedDirectory(env, invalidDirectory);
        const snapshot = await readSpecTree({ source: env.filesystemSource() });
        expect(snapshot.residual.map((entry) => entry.id)).toContain(invalidDirectory);
        expect(snapshot.allNodes.map((node) => node.id)).not.toContain(invalidDirectory);
      });
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export async function assertInjectedVersionSetProperty(): Promise<void> {
  await assertProperty(
    NAMING_SCHEMA_VERSION_TEST_GENERATOR.demotedRegistrySuffixScenario(),
    async (scenario) => {
      await withSpecTreeEnv({}, async (env) => {
        const demotedDirectory = `${env.fixture.root.order}-${env.fixture.root.slug}${scenario.demotedRegistrySuffix}`;
        await writeOrderedDirectory(env, demotedDirectory);
        const source = createFilesystemSpecTreeSource({
          productDir: env.productDir,
          schemaVersions: scenario.schemaVersions,
        });
        const snapshot = await readSpecTree({ source });
        const superseded = expectPresent(snapshot.superseded.find((entry) => entry.id === demotedDirectory));
        expect(superseded.version).toBe(scenario.demotedVersion);
        expect(snapshot.allNodes.map((node) => node.id)).not.toContain(demotedDirectory);
      });
    },
    { level: PROPERTY_LEVEL.L1 },
  );
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
