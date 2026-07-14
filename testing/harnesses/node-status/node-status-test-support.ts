import { expect } from "vitest";

import { NODE_STATUS_EXCLUDE_FILENAME } from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { NODE_STATUS_READABLE_SLUGS, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { withClassificationTree } from "@testing/harnesses/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

export async function assertClassificationTreeMaterialization(): Promise<void> {
  await assertProperty(
    NODE_STATUS_TEST_GENERATOR.classificationTree(),
    async (fixture) => {
      await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
        expect(expectations).toHaveLength(fixture.nodes.length);
        const nodesById = new Map(fixture.nodes.map((node) => [node.dirName, node]));

        for (const expectation of expectations) {
          const generatedNode = nodesById.get(expectation.nodeId);
          expect(generatedNode).toBeDefined();
          await expect(
            env.readFile(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${expectation.nodeId}/${expectation.slug}.md`),
          ).resolves.not.toHaveLength(0);
          expect(expectation.evidencePaths).toHaveLength(
            generatedNode?.facts.hasVerificationReferences === true ? 1 : 0,
          );
          for (const evidencePath of expectation.evidencePaths) {
            await expect(env.readFile(evidencePath)).resolves.not.toHaveLength(0);
          }
        }

        const resolveOutcome = await recordOutcomeEvidence();
        for (const expectation of expectations) {
          const resolved = await resolveOutcome(expectation.nodeId, expectation.evidencePaths);
          expect(Object.values(resolved)).toEqual(
            expectation.evidencePaths.map(() => expectation.facts.expectedEvidenceOutcome),
          );
        }

        const excludedNodeIds = fixture.nodes
          .filter((node) => node.facts.isExcluded)
          .map((node) => node.dirName)
          .sort((left, right) => left.localeCompare(right));
        if (excludedNodeIds.length > 0) {
          const excludeFile = await env.readFile(
            `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${NODE_STATUS_EXCLUDE_FILENAME}`,
          );
          expect(excludeFile.trim().split(/\n/u).sort((left, right) => left.localeCompare(right))).toEqual(
            excludedNodeIds,
          );
        }
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export function assertDelegationTreeConsultationClasses(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.delegationTree(),
    (fixture) => {
      expect(
        fixture.nodes.filter(
          (node) => node.facts.hasVerificationReferences && !node.facts.isExcluded,
        ),
      ).toHaveLength(1);
      expect(fixture.nodes.filter((node) => !node.facts.hasVerificationReferences)).toHaveLength(1);
      expect(
        fixture.nodes.filter(
          (node) => node.facts.hasVerificationReferences && node.facts.isExcluded,
        ),
      ).toHaveLength(1);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertGeneratedNodeSlugsAreReadable(): void {
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.classificationTree(),
    (fixture) => {
      expectReadableSlugs(fixture.nodes);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
  assertProperty(
    NODE_STATUS_TEST_GENERATOR.delegationTree(),
    (fixture) => {
      expectReadableSlugs(fixture.nodes);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

function expectReadableSlugs(nodes: readonly { readonly slug: string }[]): void {
  for (const node of nodes) {
    expect(NODE_STATUS_READABLE_SLUGS).toContain(node.slug);
    expect(node.slug).not.toMatch(/-{2}/u);
  }
}
