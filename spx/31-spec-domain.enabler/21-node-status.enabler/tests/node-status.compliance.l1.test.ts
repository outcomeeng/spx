import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus, statusCommand } from "@/commands/spec/status";
import {
  createNodeStatusExcludeReader,
  createNodeStatusFile,
  createNodeStatusProvider,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  readNodeStatus,
  serializeNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { createClaimedTestStatus, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  commitSpecTree,
  createConsultationRecordingResolver,
  listNodeStatusFiles,
  readNodeStatusFileBytes,
  readSpecTreeWorkingChanges,
  trackSpecTree,
  withClassificationTree,
} from "@testing/harnesses/node-status/node-status";

describe("spx spec status --update write set", () => {
  it("ALWAYS: writes a schema-version-1 spx.status.json into each tracked node directory, recording only that node's linked references", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.delegationTree()),
      async ({ env, expectations, recordOutcomeEvidence }) => {
        await trackSpecTree(env.productDir);
        await updateNodeStatus({
          productDir: env.productDir,
          resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
        });

        for (const expectation of expectations) {
          const recorded = readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId));
          expect(recorded?.[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);
          expect(
            Object.keys(recorded?.[NODE_STATUS_FIELD.VERIFICATION][NODE_STATUS_VERIFICATION_MECHANISM.TEST] ?? {})
              .filter((reference) => reference !== NODE_STATUS_FIELD.OVERALL)
              .sort(compareAsciiStrings),
          ).toEqual([...expectation.evidencePaths].sort(compareAsciiStrings));
        }
      },
    );
  });
});

describe("status read paths", () => {
  it("NEVER: spx spec status, the evidence provider, the EXCLUDE reader, or the status reader writes spx.status.json — neither creating one where none exists nor changing one --update wrote", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTree()),
      async ({ env, expectations, recordOutcomeEvidence }) => {
        const runReadPaths = async (): Promise<void> => {
          await statusCommand({ cwd: env.productDir, onWarning: () => undefined });
          await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
            evidence: createNodeStatusProvider(env.productDir),
          });
          createNodeStatusExcludeReader(env.productDir);
          for (const expectation of expectations) {
            readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId));
          }
        };

        await runReadPaths();

        expect(await listNodeStatusFiles(env.productDir)).toEqual([]);

        await updateNodeStatus({
          productDir: env.productDir,
          resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
        });
        const writtenByUpdate = await readNodeStatusFileBytes(env.productDir);
        expect(Object.keys(writtenByUpdate).sort(compareAsciiStrings)).toEqual(
          expectations.map((expectation) => expectation.statusPath).sort(compareAsciiStrings),
        );

        await runReadPaths();

        expect(await readNodeStatusFileBytes(env.productDir)).toEqual(writtenByUpdate);
      },
    );
  });
});

describe("spx spec status --update outcome source", () => {
  it("ALWAYS: consults recorded evidence only for linked references of test-outcome-stage nodes, while declared and specified nodes classify structurally", async () => {
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

        const projected = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          evidence: createNodeStatusProvider(env.productDir),
        });
        for (const expectation of expectations.filter((candidate) => !candidate.facts.hasVerificationReferences)) {
          expect(
            readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId))?.[
              NODE_STATUS_FIELD.VERIFICATION
            ],
          ).toEqual({});
          expect(projected.allNodes.find((node) => node.id === expectation.nodeId)?.state).toBe(
            SPEC_TREE_NODE_STATE.DECLARED,
          );
        }
        for (
          const expectation of expectations.filter((candidate) =>
            candidate.facts.hasVerificationReferences && candidate.facts.isExcluded
          )
        ) {
          expect(projected.allNodes.find((node) => node.id === expectation.nodeId)?.state).toBe(
            SPEC_TREE_NODE_STATE.SPECIFIED,
          );
        }
      },
    );
  });

  it("ALWAYS: executes no verification — a linked reference no recorded run covers reads not-run after --update", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.delegationTree()),
      async ({ env, expectations, recordedOutcomeResolver }) => {
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome: recordedOutcomeResolver() });

        for (const expectation of expectations.filter((candidate) => candidate.facts.hasVerificationReferences)) {
          const testRecord = readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId))
            ?.[NODE_STATUS_FIELD.VERIFICATION][NODE_STATUS_VERIFICATION_MECHANISM.TEST];
          for (const evidencePath of expectation.evidencePaths) {
            expect(testRecord?.[evidencePath]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
          }
        }
      },
    );
  });
});

describe("spx spec status --update over a drifted committed projection", () => {
  it("ALWAYS: rewrites the committed spx.status.json to the projection of the recorded evidence, leaving spx/ changed", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.delegationTree()),
      async ({ env, expectations, recordOutcomeEvidence }) => {
        const stageNode = expectations.find((expectation) =>
          expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded
        );
        expect(stageNode).toBeDefined();
        if (stageNode === undefined) return;

        await trackSpecTree(env.productDir);
        const { resolveOutcome } = await recordOutcomeEvidence();
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome });
        await commitSpecTree(env.productDir);
        await env.writeRaw(
          stageNode.statusPath,
          serializeNodeStatus(
            createClaimedTestStatus(
              stageNode.evidencePaths,
              sampleGeneratedValue(
                NODE_STATUS_TEST_GENERATOR.contradictingEvidenceOutcome(stageNode.facts.expectedEvidenceOutcome),
              ),
            ),
          ),
        );
        await commitSpecTree(env.productDir);
        expect(await readSpecTreeWorkingChanges(env.productDir)).toEqual([]);

        await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

        expect(await readSpecTreeWorkingChanges(env.productDir)).toEqual([stageNode.statusPath]);
        expect(
          readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, stageNode.nodeId))?.[
            NODE_STATUS_FIELD.VERIFICATION
          ],
        ).toEqual({
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
            [NODE_STATUS_FIELD.OVERALL]: stageNode.facts.expectedEvidenceOutcome,
            ...Object.fromEntries(
              stageNode.evidencePaths.map((path) => [path, stageNode.facts.expectedEvidenceOutcome]),
            ),
          },
        });
      },
    );
  });
});

describe("a missing spx.status.json", () => {
  it("NEVER: is an error or a fixed state — readers return nothing and status reports the live-derived state", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTreeWithVerificationReferences()),
      async ({ env, expectations }) => {
        const provider = createNodeStatusProvider(env.productDir);
        const live = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) });

        for (const expectation of expectations) {
          expect(readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId)))
            .toBeUndefined();
          const sourceEntry = live.entries.find((entry) =>
            entry.type === SPEC_TREE_ENTRY_TYPE.NODE && entry.id === expectation.nodeId
          );
          expect(sourceEntry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
          if (sourceEntry?.type === SPEC_TREE_ENTRY_TYPE.NODE) {
            expect(provider.stateForNode?.(sourceEntry, [])).toBeUndefined();
          }
        }
        await expect(
          statusCommand({ cwd: env.productDir, format: OUTPUT_FORMAT.JSON, onWarning: () => undefined }),
        ).resolves.toEqual(renderSpecStatus(projectSpecTree(live), OUTPUT_FORMAT.JSON));
      },
    );
  });
});

describe("spx spec status --update tracked-tree boundary", () => {
  it("NEVER: writes into a node-shaped directory git does not track, and removes a stale spx.status.json already there", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTree()),
      async ({ env, expectations, recordOutcomeEvidence }) => {
        await trackSpecTree(env.productDir);
        const staleStatusPath = sampleGeneratedValue(
          NODE_STATUS_TEST_GENERATOR.untrackedNodeStatusPath(expectations.map((expectation) => expectation.nodeId)),
        );
        await env.writeRaw(staleStatusPath, serializeNodeStatus(createNodeStatusFile({})));

        await updateNodeStatus({
          productDir: env.productDir,
          resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
        });

        expect([...await listNodeStatusFiles(env.productDir)].sort(compareAsciiStrings)).toEqual(
          expectations.map((expectation) => expectation.statusPath).sort(compareAsciiStrings),
        );
      },
    );
  });

  it("ALWAYS: records a tracked node directory's evidence in full, including an evidence file not yet individually tracked", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTree()),
      async ({ env, expectations, fixturePayloads, recordOutcomeEvidence }) => {
        await trackSpecTree(env.productDir);
        const trackedNode = expectations[0];
        const untrackedEvidence = [
          SPEC_TREE_CONFIG.ROOT_DIRECTORY,
          trackedNode.nodeId,
          SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
          sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName()),
        ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
        await env.writeRaw(untrackedEvidence, fixturePayloads.test);

        await updateNodeStatus({
          productDir: env.productDir,
          resolveOutcome: (await recordOutcomeEvidence()).resolveOutcome,
        });

        expect(
          Object.keys(
            readNodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, trackedNode.nodeId))?.[
              NODE_STATUS_FIELD.VERIFICATION
            ][NODE_STATUS_VERIFICATION_MECHANISM.TEST] ?? {},
          ),
        ).toContain(untrackedEvidence);
      },
    );
  });
});
