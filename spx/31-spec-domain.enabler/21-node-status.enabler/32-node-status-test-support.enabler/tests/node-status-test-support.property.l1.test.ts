import { describe, expect, it } from "vitest";

import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { NODE_STATUS_READABLE_SLUGS, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { withClassificationTree } from "@testing/harnesses/node-status/node-status";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("node-status test support", () => {
  it("materializes generated classification facts and resolves recorded evidence", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.classificationTree(),
      async (fixture) => {
        await withClassificationTree(fixture, async ({ env, expectations, fixturePayloads, recordOutcomeEvidence }) => {
          expect(expectations.map((expectation) => expectation.nodeId)).toEqual(
            fixture.nodes.map((node) => node.dirName),
          );

          for (const node of fixture.nodes) {
            const expectation = expectations.find((candidate) => candidate.nodeId === node.dirName);
            expect(expectation?.facts).toEqual(node.facts);
            await expect(
              env.readFile(
                [
                  SPEC_TREE_CONFIG.ROOT_DIRECTORY,
                  node.dirName,
                  `${node.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
                ]
                  .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
              ),
            ).resolves.toBe(fixturePayloads.spec);
            expect(expectation?.evidencePaths).toHaveLength(node.facts.hasVerificationReferences ? 1 : 0);
            for (const evidencePath of expectation?.evidencePaths ?? []) {
              await expect(env.readFile(evidencePath)).resolves.toBe(fixturePayloads.test);
            }
          }

          const excludedNodeIds = fixture.nodes.filter((node) => node.facts.isExcluded).map((node) => node.dirName);
          if (excludedNodeIds.length > 0) {
            const excludeFile = await env.readFile(
              [SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
            );
            expect(
              excludeFile.split(NODE_STATUS_EXCLUDE_LINE_GRAMMAR.ENTRY_SEPARATOR).filter((line) => line.length > 0)
                .sort((left, right) => left.localeCompare(right)),
            ).toEqual(excludedNodeIds.sort((left, right) => left.localeCompare(right)));
          }

          const { resolveOutcome, runs } = await recordOutcomeEvidence();
          expect(runs.map((run) => run.nodeId).sort((left, right) => left.localeCompare(right))).toEqual(
            fixture.nodes
              .filter((node) => node.facts.hasVerificationReferences && !node.facts.isExcluded)
              .map((node) => node.dirName)
              .sort((left, right) => left.localeCompare(right)),
          );
          for (const run of runs) {
            const node = fixture.nodes.find((candidate) => candidate.dirName === run.nodeId);
            expect(run.result.dispatch.reports.flatMap((report) => report.testPaths)).toEqual(run.evidencePaths);
            expect(run.runnerCalls).not.toHaveLength(0);
            expect(run.result.recorded.status).toBe(
              node?.facts.expectedEvidenceOutcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED
                ? TEST_RUN_STATE_STATUS.PASSED
                : TEST_RUN_STATE_STATUS.FAILED,
            );
          }

          for (const expectation of expectations) {
            const resolved = await resolveOutcome(expectation.nodeId, expectation.evidencePaths);
            expect(Object.values(resolved)).toEqual(
              expectation.evidencePaths.map(() => expectation.facts.expectedEvidenceOutcome),
            );
          }
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("generates delegation trees that span every consultation class", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.delegationTree(),
      (fixture) => {
        const testOutcomeStage = fixture.nodes.filter(
          (node) => node.facts.hasVerificationReferences && !node.facts.isExcluded,
        );
        const declared = fixture.nodes.filter((node) => !node.facts.hasVerificationReferences);
        const specified = fixture.nodes.filter(
          (node) => node.facts.hasVerificationReferences && node.facts.isExcluded,
        );
        expect(testOutcomeStage).toHaveLength(1);
        expect(declared).toHaveLength(1);
        expect(specified).toHaveLength(1);
        expect(fixture.nodes).toHaveLength(testOutcomeStage.length + declared.length + specified.length);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("generates node slugs from the readable slug domain", () => {
    for (const tree of [NODE_STATUS_TEST_GENERATOR.classificationTree(), NODE_STATUS_TEST_GENERATOR.delegationTree()]) {
      assertProperty(
        tree,
        (fixture) => {
          for (const node of fixture.nodes) {
            expect(NODE_STATUS_READABLE_SLUGS).toContain(node.slug);
            expect(node.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    }
  });
});
