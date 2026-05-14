import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  getKindDefinition,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { KIND_REGISTRY, type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
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

describe("SpecTreeSource mappings", () => {
  it("maps filesystem source records and in-memory records to equivalent projections", async () => {
    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();

      const filesystemProjection = projectSpecTree(
        await readSpecTree({
          source: env.filesystemSource(),
        }),
      );
      const inMemoryProjection = await env.projectMemory();

      expect(expectPresent(filesystemProjection.product).title).toBe(expectPresent(inMemoryProjection.product).title);
      expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(inMemoryProjection));
      expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(inMemoryProjection));
    });
  });

  it("uses product-root-relative refs and an inclusion predicate", async () => {
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
        throw new Error("Filesystem source test expected a readable source ref");
      }

      expect(snapshot.allNodes.map((node) => node.id)).toEqual([includedDirectory]);
      expect(ref.path).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${includedDirectory}/${env.fixture.root.slug}.md`);
      await expect(source.readText(ref)).resolves.toBe(includedText);
    });
  });

  it("maps co-located test files to linked evidence records", async () => {
    await withSpecTreeEnv({}, async (env) => {
      await env.materialize();
      const rootDirectory = nodeDirectoryName(env.fixture.root);
      const evidenceFile = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
      const nonEvidenceSuffix = sampleSpecTreeTestValue(
        SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY),
      );
      const evidencePath = [
        SPEC_TREE_CONFIG.ROOT_DIRECTORY,
        rootDirectory,
        SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
        evidenceFile,
      ].join("/");
      await env.writeRaw(evidencePath, "");
      await env.writeRaw(`${evidencePath}${nonEvidenceSuffix}`, "");

      const snapshot = await readSpecTree({ source: env.filesystemSource() });
      const root = expectPresent(snapshot.allNodes.find((node) => node.id === rootDirectory));
      const evidence = snapshot.entries.filter(isEvidenceEntry);
      const evidenceEntry = expectPresent(evidence[0]);

      expect(root.state).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
      expect(evidence).toHaveLength(1);
      expect(evidenceEntry).toMatchObject({
        id: `${rootDirectory}/${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}/${evidenceFile}`,
        parentId: rootDirectory,
        status: SPEC_TREE_EVIDENCE_STATUS.LINKED,
      });
      expect(evidenceEntry.ref?.path).toBe(evidencePath);
    });
  });

  it("does not traverse registered descendants below unregistered ordered directories", async () => {
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
  });
});

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
  const definition = getKindDefinition(node.kind);
  return `${node.order}-${node.slug}${definition.suffix}`;
}
