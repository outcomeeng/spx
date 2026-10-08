import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNodeStatusProvider,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  readNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createConsultationRecordingResolver,
  listNodeStatusFiles,
  withClassificationTree,
} from "@testing/harnesses/node-status/node-status";

describe("a node with no spx.status.json", () => {
  it("derives its lifecycle state live instead of reading a file", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTreeWithVerificationReferences()),
      async ({ env, expectations }) => {
        expect(await listNodeStatusFiles(env.productDir)).toEqual([]);

        const provider = createNodeStatusProvider(env.productDir);
        const liveSnapshot = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
        });
        const providedSnapshot = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          evidence: provider,
        });

        for (const expectation of expectations) {
          const sourceEntry = liveSnapshot.entries.find((entry) =>
            entry.type === SPEC_TREE_ENTRY_TYPE.NODE && entry.id === expectation.nodeId
          );
          expect(sourceEntry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
          if (sourceEntry?.type === SPEC_TREE_ENTRY_TYPE.NODE) {
            expect(provider.stateForNode?.(sourceEntry, [])).toBeUndefined();
          }
          expect(providedSnapshot.allNodes.find((node) => node.id === expectation.nodeId)?.state).toBe(
            liveSnapshot.allNodes.find((node) => node.id === expectation.nodeId)?.state,
          );
        }
      },
    );
  });
});

describe("spx spec status --update over a node with linked verification references", () => {
  it("records outcomes for exactly those references from recorded evidence, then derives the lifecycle projection", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.delegationTree()),
      async ({ env, expectations, recordOutcomeEvidence }) => {
        const recording = createConsultationRecordingResolver((await recordOutcomeEvidence()).resolveOutcome);
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome: recording.resolveOutcome });

        expect(recording.consultations).toEqual(
          expectations
            .filter((expectation) => expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded)
            .map((expectation) => ({ nodeId: expectation.nodeId, evidencePaths: expectation.evidencePaths })),
        );

        for (const expectation of expectations) {
          const recorded = readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId));
          expect(recorded?.[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);
          // One linked reference per node, so its mechanism overall is that reference's outcome.
          expect(recorded?.[NODE_STATUS_FIELD.VERIFICATION]).toEqual(
            expectation.evidencePaths.length === 0 ? {} : {
              [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
                [NODE_STATUS_FIELD.OVERALL]: expectation.facts.expectedEvidenceOutcome,
                ...Object.fromEntries(
                  expectation.evidencePaths.map((path) => [path, expectation.facts.expectedEvidenceOutcome]),
                ),
              },
            },
          );
        }

        const projected = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          evidence: createNodeStatusProvider(env.productDir),
        });
        for (const expectation of expectations) {
          expect(projected.allNodes.find((node) => node.id === expectation.nodeId)?.state).toBe(
            !expectation.facts.hasVerificationReferences
              ? SPEC_TREE_NODE_STATE.DECLARED
              : expectation.facts.isExcluded
              ? SPEC_TREE_NODE_STATE.SPECIFIED
              : expectation.facts.expectedEvidenceOutcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED
              ? SPEC_TREE_NODE_STATE.PASSING
              : SPEC_TREE_NODE_STATE.FAILING,
          );
        }
      },
    );
  });
});
