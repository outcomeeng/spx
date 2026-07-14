import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_FIELD,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree";
import {
  type ClassificationFixtureFacts,
  NODE_STATUS_READABLE_SLUGS,
  NODE_STATUS_TEST_GENERATOR,
} from "@testing/generators/node-status/node-status";
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
            expectStatusFileMatchesFacts(
              generatedNode.facts,
              expectation.evidencePaths,
              expectation.expectedStatusFile,
            );
            expectLifecycleStatusMatchesFacts(generatedNode.facts, expectation.expectedStatus);
          }

          if (excludedNodeIds.length > 0) {
            const excludeFile = await env.readFile(
              `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${NODE_STATUS_EXCLUDE_FILENAME}`,
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
        expectNodeSlugsToComeFromReadablePool(fixture.nodes);
      }),
    );
    fc.assert(
      fc.property(NODE_STATUS_TEST_GENERATOR.delegationTree(), (fixture) => {
        expectNodeSlugsToComeFromReadablePool(fixture.nodes);
      }),
    );
  });
});

function expectNodeSlugsToComeFromReadablePool(nodes: readonly { slug: string }[]): void {
  for (const node of nodes) {
    expect(NODE_STATUS_READABLE_SLUGS).toContain(node.slug);
    expect(node.slug).not.toMatch(/-{2}/u);
  }
}

function expectStatusFileMatchesFacts(
  facts: ClassificationFixtureFacts,
  evidencePaths: readonly string[],
  statusFile: NodeStatusFile,
): void {
  if (!facts.hasVerificationReferences) {
    expect(statusFile.verification).toEqual({});
    return;
  }

  const expectedPersistedOutcome = expectedPersistedOutcomeFor(facts);
  const testVerification = statusFile.verification[NODE_STATUS_VERIFICATION_MECHANISM.TEST];
  expect(testVerification).toBeDefined();
  if (testVerification === undefined) return;
  expect(testVerification[NODE_STATUS_FIELD.OVERALL]).toBe(expectedPersistedOutcome);
  expect(evidencePaths).toHaveLength(1);
  for (const evidencePath of evidencePaths) {
    expect(testVerification[evidencePath]).toBe(expectedPersistedOutcome);
  }
}

function expectedPersistedOutcomeFor(facts: ClassificationFixtureFacts): NodeStatusEvidenceOutcome {
  if (facts.isExcluded) return NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  return facts.testsPass ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
}

function expectLifecycleStatusMatchesFacts(
  facts: ClassificationFixtureFacts,
  expectedStatus: SpecTreeNodeState,
): void {
  if (!facts.hasVerificationReferences) {
    expect(expectedStatus).toBe(SPEC_TREE_NODE_STATE.DECLARED);
    return;
  }

  if (facts.isExcluded) {
    expect(expectedStatus).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
    return;
  }

  expect(expectedStatus).toBe(facts.testsPass ? SPEC_TREE_NODE_STATE.PASSING : SPEC_TREE_NODE_STATE.FAILING);
}
