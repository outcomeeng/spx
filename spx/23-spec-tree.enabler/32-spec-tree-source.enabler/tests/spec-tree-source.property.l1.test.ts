import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, projectSpecTree, readSpecTree, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { decisionSignatures, nodeDirectoryName, nodeSignatures } from "@testing/harnesses/spec-tree/spec-tree-source";

describe("SpecTreeSource properties", () => {
  it("projects every generated valid tree equivalently from filesystem and memory sources", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
      async (fixture) => {
        await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          await env.materialize();
          const filesystemProjection = projectSpecTree(await readSpecTree({ source: env.filesystemSource() }));
          const inMemoryProjection = await env.projectMemory();
          expect(filesystemProjection.product?.title).toBeDefined();
          expect(filesystemProjection.product?.title).toBe(inMemoryProjection.product?.title);
          expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(inMemoryProjection));
          expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(inMemoryProjection));
        }, { fixture });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects registered descendants below every generated invalid ordered directory", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.invalidOrderedDirectory(KIND_REGISTRY),
      async (invalidDirectory) => {
        await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          await env.writeRaw(
            [
              SPEC_TREE_CONFIG.ROOT_DIRECTORY,
              invalidDirectory,
              nodeDirectoryName(env.fixture.child),
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
  });
});
