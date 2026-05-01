import { describe, expect, it } from "vitest";

import {
  createFilesystemSpecTreeSource,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeSourceEntry,
} from "@/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import {
  createSource,
  sampleDecisionKind,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree";

describe("SpecTreeSource mappings", () => {
  it("maps filesystem source records and in-memory records to equivalent projections", async () => {
    await withTestEnv({}, async ({ projectDir, writeDecision, writeNode, writeRaw }) => {
      const nodeKind = sampleNodeKind(KIND_REGISTRY);
      const decisionKind = sampleDecisionKind(KIND_REGISTRY);
      const rootDirectory = `21-root${KIND_REGISTRY[nodeKind].suffix}`;
      const childDirectory = `${rootDirectory}/32-child${KIND_REGISTRY[nodeKind].suffix}`;
      const decisionPath = `${rootDirectory}/21-kind-registry${KIND_REGISTRY[decisionKind].suffix}`;
      const productPath = `fixture${SPEC_TREE_CONFIG.PRODUCT.SUFFIX}`;

      await writeRaw(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${productPath}`, "# Fixture\n");
      await writeNode(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}/root.md`, "# Root\n");
      await writeNode(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childDirectory}/child.md`, "# Child\n");
      await writeDecision(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${decisionPath}`, "# Kind Registry\n");

      const filesystemProjection = projectSpecTree(
        await readSpecTree({
          source: createFilesystemSpecTreeSource({ projectRoot: projectDir }),
        }),
      );
      const inMemoryProjection = projectSpecTree(
        await readSpecTree({
          source: createSource(
            [
              {
                type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
                id: productPath,
                title: "fixture",
                ref: {
                  id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${productPath}`,
                  path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${productPath}`,
                },
              },
              {
                type: SPEC_TREE_ENTRY_TYPE.NODE,
                id: rootDirectory,
                kind: nodeKind,
                order: 21,
                slug: "root",
                ref: {
                  id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}`,
                  path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${rootDirectory}`,
                },
              },
              {
                type: SPEC_TREE_ENTRY_TYPE.NODE,
                id: childDirectory,
                kind: nodeKind,
                order: 32,
                slug: "child",
                parentId: rootDirectory,
                ref: {
                  id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childDirectory}`,
                  path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${childDirectory}`,
                },
              },
              {
                type: SPEC_TREE_ENTRY_TYPE.DECISION,
                id: decisionPath,
                kind: decisionKind,
                order: 21,
                slug: "kind-registry",
                parentId: rootDirectory,
                ref: {
                  id: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${decisionPath}`,
                  path: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${decisionPath}`,
                },
              },
            ] satisfies readonly SpecTreeSourceEntry[],
          ),
        }),
      );

      expect(filesystemProjection).toEqual(inMemoryProjection);
    });
  });

  it("uses project-root-relative refs and an inclusion predicate", async () => {
    await withTestEnv({}, async ({ projectDir, writeNode }) => {
      const nodeKind = sampleNodeKind(KIND_REGISTRY);
      const includedSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const excludedSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const includedText = `# ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle())}\n`;
      const includedDirectory = `21-${includedSlug}${KIND_REGISTRY[nodeKind].suffix}`;
      const excludedDirectory = `32-${excludedSlug}${KIND_REGISTRY[nodeKind].suffix}`;

      await writeNode(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${includedDirectory}/${includedSlug}.md`, includedText);
      await writeNode(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedDirectory}/${excludedSlug}.md`, includedText);

      const source = createFilesystemSpecTreeSource({
        projectRoot: projectDir,
        includePath: (path) => !path.includes(excludedDirectory),
      });
      const snapshot = await readSpecTree({ source });
      const ref = snapshot.allNodes[0]?.ref;
      if (source.readText === undefined || ref === undefined) {
        throw new Error("Filesystem source test expected a readable source ref");
      }

      expect(snapshot.allNodes.map((node) => node.id)).toEqual([includedDirectory]);
      expect(ref.path).toBe(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${includedDirectory}/${includedSlug}.md`);
      await expect(source.readText(ref)).resolves.toBe(includedText);
    });
  });
});
