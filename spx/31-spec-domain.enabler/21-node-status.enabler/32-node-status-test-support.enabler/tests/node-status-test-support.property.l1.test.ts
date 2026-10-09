import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultGitDependencies, detectWorktreeProductRoot } from "@/lib/git/root";
import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FIELD,
  NODE_STATUS_VERIFICATION_MECHANISM,
  readNodeStatus,
} from "@/lib/node-status";
import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { NODE_STATUS_READABLE_SLUGS, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import {
  CLASSIFICATION_FIXTURE_PATHS,
  withClassificationTree,
  withStatusWriterTree,
} from "@testing/harnesses/node-status/node-status";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";

describe("node-status test support", () => {
  it("materializes generated classification facts and resolves recorded evidence", async () => {
    await assertProperty(
      NODE_STATUS_TEST_GENERATOR.classificationTree(),
      async (fixture) => {
        await withClassificationTree(fixture, async ({ env, expectations, recordOutcomeEvidence }) => {
          expect(expectations.map((expectation) => expectation.nodeId)).toEqual(
            fixture.nodes.map((node) => node.dirName),
          );
          const [specFixtureBytes, testFixtureBytes] = await Promise.all([
            readFile(CLASSIFICATION_FIXTURE_PATHS.spec),
            readFile(CLASSIFICATION_FIXTURE_PATHS.test),
          ]);

          for (const node of fixture.nodes) {
            const expectation = expectations.find((candidate) => candidate.nodeId === node.dirName);
            expect(expectation?.facts).toEqual(node.facts);
            const specText = await env.readFile(
              [
                SPEC_TREE_CONFIG.ROOT_DIRECTORY,
                node.dirName,
                `${node.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
              ]
                .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
            );
            expect(Buffer.from(specText)).toEqual(specFixtureBytes);
            expect(node.evidenceReference !== undefined).toBe(node.facts.hasVerificationReferences);
            expect(expectation?.evidencePaths).toEqual(
              node.evidenceReference === undefined
                ? []
                : [
                  [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, node.evidenceReference].join(
                    SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                  ),
                ],
            );
            for (const evidencePath of expectation?.evidencePaths ?? []) {
              expect(Buffer.from(await env.readFile(evidencePath))).toEqual(testFixtureBytes);
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

  it(
    "materializes generated status-writer trees outside any git repository with their committed claims and answers the resolver from the generated outcomes",
    async () => {
      await assertProperty(
        NODE_STATUS_TEST_GENERATOR.statusWriterTree(),
        async (fixture) => {
          await withStatusWriterTree(fixture, async ({ env, expectations, resolveOutcome }) => {
            const [specFixtureBytes, testFixtureBytes, worktreeRoot] = await Promise.all([
              readFile(CLASSIFICATION_FIXTURE_PATHS.spec),
              readFile(CLASSIFICATION_FIXTURE_PATHS.test),
              detectWorktreeProductRoot(env.productDir, defaultGitDependencies),
            ]);
            expect(worktreeRoot.isGitRepo).toBe(false);
            expect(expectations.map((expectation) => expectation.nodeId)).toEqual(
              fixture.nodes.map((node) => node.dirName),
            );

            for (const node of fixture.nodes) {
              const expectation = expectations.find((candidate) => candidate.nodeId === node.dirName);
              const specPath = [
                SPEC_TREE_CONFIG.ROOT_DIRECTORY,
                node.dirName,
                `${node.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
              ].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
              expect(Buffer.from(await env.readFile(specPath))).toEqual(specFixtureBytes);
              expect(expectation?.evidencePaths).toEqual(
                node.references.map(({ reference }) =>
                  [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, reference].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
                ),
              );
              for (const evidencePath of expectation?.evidencePaths ?? []) {
                expect(Buffer.from(await env.readFile(evidencePath))).toEqual(testFixtureBytes);
              }

              const committedClaims = [
                ...node.references.flatMap(({ reference, committedOutcome }) =>
                  committedOutcome === undefined
                    ? []
                    : [
                      [
                        [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, reference].join(
                          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                        ),
                        committedOutcome,
                      ] as const,
                    ]
                ),
                ...(node.unlinkedClaim === undefined ? [] : [
                  [
                    [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, node.unlinkedClaim.reference].join(
                      SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                    ),
                    node.unlinkedClaim.outcome,
                  ] as const,
                ]),
              ];
              const committedRecord = readNodeStatus(
                join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName),
              )?.[NODE_STATUS_FIELD.VERIFICATION][NODE_STATUS_VERIFICATION_MECHANISM.TEST];
              expect(
                committedRecord === undefined ? undefined : Object.fromEntries(
                  Object.entries(committedRecord).filter(([key]) => key !== NODE_STATUS_FIELD.OVERALL),
                ),
              ).toEqual(committedClaims.length === 0 ? undefined : Object.fromEntries(committedClaims));

              await expect(resolveOutcome(node.dirName, expectation?.evidencePaths ?? [])).resolves.toEqual(
                Object.fromEntries(
                  node.references.flatMap(({ reference, resolverOutcome }) =>
                    resolverOutcome === undefined
                      ? []
                      : [
                        [
                          [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, reference].join(
                            SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                          ),
                          resolverOutcome,
                        ] as const,
                      ]
                  ),
                ),
              );
            }

            const excludedNodeIds = fixture.nodes.filter((node) => node.isExcluded).map((node) => node.dirName);
            if (excludedNodeIds.length > 0) {
              const excludeFile = await env.readFile(
                [SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
              );
              expect(
                excludeFile.split(NODE_STATUS_EXCLUDE_LINE_GRAMMAR.ENTRY_SEPARATOR).filter((line) => line.length > 0)
                  .sort(compareAsciiStrings),
              ).toEqual(excludedNodeIds.sort(compareAsciiStrings));
            }
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

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
    for (
      const treeSlugs of [
        NODE_STATUS_TEST_GENERATOR.classificationTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
        NODE_STATUS_TEST_GENERATOR.delegationTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
        NODE_STATUS_TEST_GENERATOR.statusWriterTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
      ]
    ) {
      assertProperty(
        treeSlugs,
        (slugs) => {
          for (const slug of slugs) {
            expect(NODE_STATUS_READABLE_SLUGS).toContain(slug);
            expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    }
  });

  it("generates untracked node-status paths whose node directories carry readable slugs", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.untrackedNodeStatusPath(),
      (statusPath) => {
        const entry = recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: posix.dirname(statusPath),
        });
        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        const slug = entry?.type === SPEC_TREE_ENTRY_TYPE.NODE ? entry.slug : undefined;
        expect(NODE_STATUS_READABLE_SLUGS).toContain(slug);
        expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
