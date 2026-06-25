import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import { classifyNodeStatus, NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { NODE_STATUS_READABLE_SLUGS, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import {
  NODE_STATUS_CLASSIFICATION_EVIDENCE_CONTENT,
  NODE_STATUS_CLASSIFICATION_SPEC_CONTENT,
  withClassificationTree,
} from "@testing/harnesses/node-status/node-status";

describe("node-status test support", () => {
  it("materializes classification-tree fixtures from generated facts", async () => {
    await fc.assert(
      fc.asyncProperty(NODE_STATUS_TEST_GENERATOR.classificationTree(), async (fixture) => {
        await withClassificationTree(fixture, async ({ env, expectations, resolveOutcome }) => {
          expect(expectations).toHaveLength(fixture.nodes.length);

          const nodesById = new Map(fixture.nodes.map((node) => [node.dirName, node]));
          const excludedNodeIds = fixture.nodes
            .filter((node) => node.facts.isExcluded)
            .map((node) => node.dirName)
            .sort((left, right) => left.localeCompare(right));

          for (const expectation of expectations) {
            const generatedNode = nodesById.get(expectation.nodeId);
            expect(generatedNode).toBeDefined();
            if (generatedNode === undefined) continue;

            await expect(
              env.readFile(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${expectation.nodeId}/${expectation.slug}.md`),
            ).resolves.toBe(NODE_STATUS_CLASSIFICATION_SPEC_CONTENT);
            await Promise.all(
              expectation.evidencePaths.map(async (evidencePath) => {
                await expect(env.readFile(evidencePath)).resolves.toBe(NODE_STATUS_CLASSIFICATION_EVIDENCE_CONTENT);
              }),
            );

            const resolved = await resolveOutcome(expectation.nodeId, expectation.evidencePaths);
            const expectedOutcome = generatedNode.facts.testsPass
              ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
              : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
            expect(Object.values(resolved)).toEqual(expectation.evidencePaths.map(() => expectedOutcome));
            expect(expectation.expectedStatus).toBe(classifyNodeStatus({
              hasVerificationReferences: generatedNode.facts.hasVerificationReferences,
              isExcluded: generatedNode.facts.isExcluded,
              verification: expectation.expectedStatusFile.verification,
            }));
          }

          if (excludedNodeIds.length > 0) {
            const excludeFile = await env.readFile(
              `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${IGNORE_SOURCE_FILENAME_DEFAULT}`,
            );
            expect(excludeFile.trim().split(/\n/u).sort((left, right) => left.localeCompare(right))).toEqual(
              excludedNodeIds,
            );
          }
        });
      }),
    );
  });

  it("generates delegation trees that span every consultation class", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.delegationTree(), (fixture) => {
        const testOutcomeStageNodes = fixture.nodes.filter(
          (node) => node.facts.hasVerificationReferences && !node.facts.isExcluded,
        );
        const declaredNodes = fixture.nodes.filter((node) => !node.facts.hasVerificationReferences);
        const specifiedNodes = fixture.nodes.filter((node) =>
          node.facts.hasVerificationReferences && node.facts.isExcluded
        );

        expect(testOutcomeStageNodes).toHaveLength(1);
        expect(declaredNodes).toHaveLength(1);
        expect(specifiedNodes).toHaveLength(1);
      }),
    );
  });

  it("generates node slugs from the readable slug pool", () => {
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.classificationTree(), (fixture) => {
        for (const node of fixture.nodes) {
          expect(NODE_STATUS_READABLE_SLUGS).toContain(node.slug);
          expect(node.slug).not.toMatch(/-{2}/u);
        }
      }),
    );
  });
});
