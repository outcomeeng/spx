import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus, statusCommand } from "@/commands/spec/status";
import {
  createNodeStatusExcludeReader,
  createNodeStatusFile,
  createNodeStatusProvider,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  nodeStatusClaimResults,
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
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  createConsultationRecordingResolver,
  currentMethodologyConfig,
  listNodeStatusFiles,
  methodologyDeclaringConfig,
  readNodeStatusFileBytes,
  readSpecTreeWorkingChanges,
  readVersion1NodeStatus,
  trackSpecTree,
  withClassificationTree,
  withPinnedNodeRepository,
  withStatusWriterTree,
  writeProductSpec,
} from "@testing/harnesses/node-status/node-status";

describe("spx spec status --update claim shape", () => {
  it("ALWAYS: writes each node's claim in the shape of the methodology version the product declares", async () => {
    for (const shape of Object.values(NODE_STATUS_CLAIM_SHAPE)) {
      const version = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.methodologyVersion(shape));
      await withStatusWriterTree(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.statusWriterTree()),
        async ({ env, expectations, resolveOutcome }) => {
          await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

          expect(expectations.length).toBeGreaterThan(0);
          for (const expectation of expectations) {
            expect(readNodeStatus(join(env.productDir, dirname(expectation.statusPath)))?.shape, version).toBe(shape);
          }
        },
        methodologyDeclaringConfig(version),
      );
    }
  });

  it("NEVER: a status read path writes a 4.0 claim — reading it, with its pins compared against git, changes no file", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(
      fixture,
      currentMethodologyConfig(),
      async (repository) => {
        await repository.writeClaim(repository.passedTestClaim(0));
        await repository.editSubject(fixture.editedSubject);
        const before = await readNodeStatusFileBytes(repository.env.productDir);

        await statusCommand({
          cwd: repository.env.productDir,
          gitDependencies: repository.git,
          onWarning: () => undefined,
        });
        await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: repository.env.productDir }),
          evidence: await createNodeStatusProvider(repository.env.productDir, { gitDependencies: repository.git }),
        });

        expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
        expect(await readSpecTreeWorkingChanges(repository.env.productDir)).toEqual([
          `${repository.nodePath}/${NODE_STATUS_FILENAME}`,
          repository.subjectPaths[fixture.editedSubject],
        ].filter((path) => path !== undefined && path.startsWith(SPEC_TREE_CONFIG.ROOT_DIRECTORY)));
      },
    );
  });
});

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
          const recorded = readVersion1NodeStatus(
            join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId),
          );
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

describe("spx spec status --update product exclusion", () => {
  it("ALWAYS: writes a status file for each tracked output node and none for a .product, under the claim shape of each declared methodology version", async () => {
    for (const shape of Object.values(NODE_STATUS_CLAIM_SHAPE)) {
      const version = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.methodologyVersion(shape));
      await withStatusWriterTree(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.statusWriterTree()),
        async ({ env, expectations, resolveOutcome }) => {
          await writeProductSpec(env, sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.productName()));

          await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

          expect(expectations.length, version).toBeGreaterThan(0);
          expect([...await listNodeStatusFiles(env.productDir)].sort(compareAsciiStrings), version).toEqual(
            expectations.map((expectation) => expectation.statusPath).sort(compareAsciiStrings),
          );
          expect(await listNodeStatusFiles(env.productDir), version).not.toContain(
            [SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
          );
        },
        methodologyDeclaringConfig(version),
      );
    }
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
            evidence: await createNodeStatusProvider(env.productDir),
          });
          createNodeStatusExcludeReader(env.productDir);
          for (const expectation of expectations) {
            readVersion1NodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId));
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
          evidence: await createNodeStatusProvider(env.productDir),
        });
        for (const expectation of expectations.filter((candidate) => !candidate.facts.hasVerificationReferences)) {
          expect(
            readVersion1NodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId))?.[
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

  it("ALWAYS: under a 4.0 methodology, derives each audit rule slug and evidence kind outcome only from the result a recorded run produced — an unanswered slug or kind reads not-run with no pin and fabricates no pass", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      const [answeredSlug = "", ...unansweredSlugs] = repository.auditRuleSlugs;
      const answeredVerdict = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.recordedVerdict());
      const attribution = repository.attribution;
      expect(unansweredSlugs.length).toBeGreaterThan(0);

      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: repository.passingOutcomes,
        resolveReadPaths: () => Promise.resolve([subject]),
        resolveAttributedResults: repository.attributedResultsFor({ [answeredSlug]: answeredVerdict }, [subject]),
        gitDependencies: repository.git,
      });

      const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      expect(written?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
      if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) return;
      const entryOf = (section: string, key: string) =>
        nodeStatusClaimResults(written.claim).find((result) => result.section === section && result.key === key)
          ?.entry;
      const notRun = { [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN };

      expect(entryOf(NODE_STATUS_CLAIM_SECTION.AUDIT, answeredSlug)).toEqual({
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: answeredVerdict,
        [NODE_STATUS_CLAIM_FIELD.COMMIT]: repository.commit,
        [NODE_STATUS_CLAIM_FIELD.READ]: [repository.specPath, subject].sort(compareAsciiStrings),
        [NODE_STATUS_CLAIM_FIELD.ACTOR]: attribution.actor,
        [NODE_STATUS_CLAIM_FIELD.RUN]: attribution.run,
      });
      for (const slug of unansweredSlugs) {
        expect(entryOf(NODE_STATUS_CLAIM_SECTION.AUDIT, slug)).toEqual(notRun);
      }
      expect(entryOf(NODE_STATUS_CLAIM_SECTION.EVIDENCE, NODE_STATUS_CLAIM_SECTION.TEST)).toEqual(notRun);
    });
  });

  it("ALWAYS: executes no verification — a linked reference no recorded run covers reads not-run after --update", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.delegationTree()),
      async ({ env, expectations, recordedOutcomeResolver }) => {
        await updateNodeStatus({ productDir: env.productDir, resolveOutcome: recordedOutcomeResolver() });

        for (const expectation of expectations.filter((candidate) => candidate.facts.hasVerificationReferences)) {
          const testRecord = readVersion1NodeStatus(
            join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId),
          )
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
      async ({ env, expectations, commitProjection, commitContradiction }) => {
        const stageNode = expectations.find((expectation) =>
          expectation.facts.hasVerificationReferences && !expectation.facts.isExcluded
        );
        expect(stageNode).toBeDefined();
        if (stageNode === undefined) return;

        const resolveOutcome = await commitProjection();
        await commitContradiction(
          stageNode,
          sampleGeneratedValue(
            NODE_STATUS_TEST_GENERATOR.contradictingEvidenceOutcome(stageNode.facts.expectedEvidenceOutcome),
          ),
        );
        expect(await readSpecTreeWorkingChanges(env.productDir)).toEqual([]);

        await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

        expect(await readSpecTreeWorkingChanges(env.productDir)).toEqual([stageNode.statusPath]);
        expect(
          readVersion1NodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, stageNode.nodeId))?.[
            NODE_STATUS_FIELD.VERIFICATION
          ],
        ).toEqual({
          [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
            [NODE_STATUS_FIELD.OVERALL]: stageNode.facts.expectedMechanismOverall,
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
        const provider = await createNodeStatusProvider(env.productDir);
        const live = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) });

        for (const expectation of expectations) {
          expect(readVersion1NodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId)))
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
            readVersion1NodeStatus(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, trackedNode.nodeId))?.[
              NODE_STATUS_FIELD.VERIFICATION
            ][NODE_STATUS_VERIFICATION_MECHANISM.TEST] ?? {},
          ),
        ).toContain(untrackedEvidence);
      },
    );
  });
});
