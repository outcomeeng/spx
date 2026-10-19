import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, projectSpecTree, readSpecTree } from "@/lib/spec-tree";
import { SPEC_TREE_TEST_GENERATOR, specTreeConfigForLine } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  decisionFileName,
  decisionLinkSignatures,
  decisionSignatures,
  nodeDirectoryName,
  nodeLinkSignatures,
  nodeSignatures,
  productRelativePath,
  specTreePath,
  writeFixtureEvidence,
  writeFixtureTree,
} from "@testing/harnesses/spec-tree/spec-tree-source";

describe("SpecTreeSource properties", () => {
  it("projects every generated valid tree equivalently from filesystem and memory sources", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.representativeFixtureScenario(KIND_REGISTRY),
      async (scenario) => {
        const { fixture } = scenario;
        await withSpecTreeEnv(specTreeConfigForLine(scenario.form.line), async (env) => {
          await writeFixtureTree(env, scenario.form);
          await writeFixtureEvidence(env);
          const filesystemSnapshot = await readSpecTree({ source: env.filesystemSource() });
          const inMemorySnapshot = await env.readMemorySnapshot();
          const filesystemProjection = projectSpecTree(filesystemSnapshot);
          const inMemoryProjection = projectSpecTree(inMemorySnapshot);
          expect(filesystemProjection.product?.title).toBeDefined();
          expect(filesystemProjection.product?.title).toBe(inMemoryProjection.product?.title);
          expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(inMemoryProjection));
          expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(inMemoryProjection));
          expect(nodeLinkSignatures(filesystemSnapshot)).toEqual(nodeLinkSignatures(inMemorySnapshot));
          expect(decisionLinkSignatures(filesystemSnapshot)).toEqual(decisionLinkSignatures(inMemorySnapshot));

          const rootId = nodeDirectoryName(fixture.root);
          const childId = specTreePath(rootId, nodeDirectoryName(fixture.child));
          const peerId = nodeDirectoryName(fixture.peer);
          expect(filesystemSnapshot.allNodes).toHaveLength(3);
          expect(
            filesystemSnapshot.allNodes.map((node) => ({
              id: node.id,
              parentId: node.parentId,
              refPath: node.ref?.path,
            })),
          ).toEqual(
            expect.arrayContaining([
              {
                id: rootId,
                parentId: undefined,
                refPath: productRelativePath(rootId, `${fixture.root.slug}${scenario.form.specFileSuffix}`),
              },
              {
                id: childId,
                parentId: rootId,
                refPath: productRelativePath(
                  childId,
                  `${fixture.child.slug}${scenario.form.specFileSuffix}`,
                ),
              },
              {
                id: peerId,
                parentId: undefined,
                refPath: productRelativePath(peerId, `${fixture.peer.slug}${scenario.form.specFileSuffix}`),
              },
            ]),
          );
          expect(filesystemSnapshot.decisions.map((decision) => ({
            id: decision.id,
            parentId: decision.parentId,
            refPath: decision.ref?.path,
          }))).toEqual([
            {
              id: specTreePath(rootId, decisionFileName(fixture.decision)),
              parentId: rootId,
              refPath: productRelativePath(rootId, decisionFileName(fixture.decision)),
            },
          ]);
        }, { fixture });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("rejects registered descendants below every generated invalid ordered directory", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.invalidDirectoryWithDescendant(KIND_REGISTRY),
      async (scenario) => {
        await withSpecTreeEnv(specTreeConfigForLine(scenario.line), async (env) => {
          await env.writeRaw(
            productRelativePath(scenario.directory, scenario.descendantDirectory, scenario.descendantSpecFile),
            "",
          );
          const snapshot = await readSpecTree({ source: env.filesystemSource() });
          expect(snapshot.allNodes.map((node) => node.id)).toEqual([]);
          expect(snapshot.entries.map((entry) => entry.id)).toEqual([scenario.directory]);
        });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("rejects registered descendants below every generated superseded ordered directory", async () => {
    await assertProperty(
      SPEC_TREE_TEST_GENERATOR.supersededDirectoryWithDescendant(),
      async (scenario) => {
        await withSpecTreeEnv(specTreeConfigForLine(scenario.line), async (env) => {
          await env.writeRaw(
            productRelativePath(scenario.directory, scenario.descendantDirectory, scenario.descendantSpecFile),
            "",
          );
          const snapshot = await readSpecTree({ source: env.filesystemSource() });
          expect(snapshot.allNodes.map((node) => node.id)).toEqual([]);
          expect(snapshot.superseded.map((entry) => entry.id)).toEqual([scenario.directory]);
          expect(snapshot.entries.map((entry) => entry.id)).toEqual([scenario.directory]);
        });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
