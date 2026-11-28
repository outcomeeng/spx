import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { GIT_NULL_DELIMITED_FLAG, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { defaultGitDependencies, detectWorktreeProductRoot, GIT_STATUS_PORCELAIN_ARGS } from "@/lib/git/root";
import {
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_LINE_GRAMMAR,
  NODE_STATUS_FIELD,
  NODE_STATUS_VERIFICATION_MECHANISM,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  recognizeSpecTreeFilesystemEntry,
  SPEC_CONTEXT_SELECTED_METADATA_KEY,
  SPEC_TREE_AUDIT_TAG_TEXT,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_KEY_KIND,
  SPEC_TREE_EVIDENCE_TARGET,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_VERIFICATION_TYPE,
  type SpecTreeEvidenceReference,
  splitSpecContextFrontMatter,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { NODE_STATUS_READABLE_SLUGS, NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import {
  SOURCE_GRAMMAR_AUDIT_TAG_FORM,
  SOURCE_GRAMMAR_TEST_GENERATOR,
  type SourceGrammarNodeFixture,
} from "@testing/generators/node-status/source-grammar";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import {
  CLASSIFICATION_FIXTURE_PATHS,
  readVersion1NodeStatus,
  runFixtureGit,
  withClassificationTree,
  withStatusWriterTree,
} from "@testing/harnesses/node-status/node-status";
import {
  sourceGrammarTestReference,
  withSourceGrammarNode,
  withSourceGrammarNodeRepository,
} from "@testing/harnesses/node-status/source-grammar";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { migratingRecognitionOptions } from "@testing/harnesses/spec-tree/filename-grammar";

/** The audit references the spec-tree library reads from a node's spec. */
function auditReferencesOf(references: readonly SpecTreeEvidenceReference[]): readonly SpecTreeEvidenceReference[] {
  return references.filter((reference) => reference.verificationType === SPEC_TREE_VERIFICATION_TYPE.AUDIT);
}

/** The audit references a source-grammar node's audit-tag form declares under a declaration that selects the 3.x grammar. */
function expectedAuditReferences(node: SourceGrammarNodeFixture): readonly SpecTreeEvidenceReference[] {
  switch (node.facts.auditTagForm) {
    case SOURCE_GRAMMAR_AUDIT_TAG_FORM.NONE:
      return [];
    case SOURCE_GRAMMAR_AUDIT_TAG_FORM.LINKED:
      return [{
        verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.SLUG, slug: node.auditSlug },
      }];
    case SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_REVIEW:
    case SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_AUDIT:
      return [{
        verificationType: SPEC_TREE_VERIFICATION_TYPE.AUDIT,
        key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.UNKEYED },
      }];
  }
}

/** The tag a pathless audit-tag form closes its Assertion with, or none for the other forms. */
function pathlessTagOf(node: SourceGrammarNodeFixture): string | undefined {
  if (node.facts.auditTagForm === SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_REVIEW) {
    return `[${SPEC_TREE_AUDIT_TAG_TEXT.LEGACY}]`;
  }
  if (node.facts.auditTagForm === SOURCE_GRAMMAR_AUDIT_TAG_FORM.PATHLESS_AUDIT) {
    return `[${SPEC_TREE_AUDIT_TAG_TEXT.CURRENT}]`;
  }
  return undefined;
}

/** The Malleability a spec's front matter declares, or `undefined` when it declares none. */
function declaredMalleabilityOf(specText: string, specPath: string): unknown {
  const { frontMatter } = splitSpecContextFrontMatter(specText, specPath);
  const metadata = frontMatter === undefined
    ? undefined
    : (parse(frontMatter) as Readonly<Record<string, unknown>> | null);
  return metadata?.[SPEC_CONTEXT_SELECTED_METADATA_KEY];
}

/** Every path the git index of `productDir` holds. */
async function indexedPaths(productDir: string): Promise<readonly string[]> {
  return (
    await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.LS_FILES, GIT_NULL_DELIMITED_FLAG], {
      stripFinalNewline: false,
    })
  ).split(GIT_NULL_RECORD_SEPARATOR).filter((path) => path.length > 0);
}

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
          const excludeFilePath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME]
            .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
          if (excludedNodeIds.length > 0) {
            const excludeFile = await env.readFile(excludeFilePath);
            expect(
              excludeFile.split(NODE_STATUS_EXCLUDE_LINE_GRAMMAR.ENTRY_SEPARATOR).filter((line) => line.length > 0)
                .sort((left, right) => left.localeCompare(right)),
            ).toEqual(excludedNodeIds.sort((left, right) => left.localeCompare(right)));
          }

          const trackedSpecTreePaths = (
            await runFixtureGit(env.productDir, [GIT_TEST_SUBCOMMANDS.LS_FILES, GIT_NULL_DELIMITED_FLAG], {
              stripFinalNewline: false,
            })
          )
            .split(GIT_NULL_RECORD_SEPARATOR)
            .filter((path) => path.startsWith(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`));
          const materializedPaths = [
            ...fixture.nodes.flatMap((node) => [
              [SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, `${node.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`]
                .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
              ...(node.evidenceReference === undefined
                ? []
                : [[SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.dirName, node.evidenceReference].join(
                  SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                )]),
            ]),
            ...(excludedNodeIds.length > 0 ? [excludeFilePath] : []),
          ];
          expect([...trackedSpecTreePaths].sort(compareAsciiStrings)).toEqual(
            materializedPaths.sort(compareAsciiStrings),
          );

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
              const committedRecord = readVersion1NodeStatus(
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
                [SPEC_TREE_CONFIG.ROOT_DIRECTORY, SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME].join(
                  SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                ),
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

  it("readable-slugs: generates node slugs and audit slugs from the readable slug domain", () => {
    for (
      const treeSlugs of [
        NODE_STATUS_TEST_GENERATOR.classificationTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
        NODE_STATUS_TEST_GENERATOR.delegationTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
        NODE_STATUS_TEST_GENERATOR.statusWriterTree().map((fixture) => fixture.nodes.map((node) => node.slug)),
        SOURCE_GRAMMAR_TEST_GENERATOR.node().map((node) => [node.slug, node.auditSlug]),
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository().map(({ node }) => [node.slug, node.auditSlug]),
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

  it(
    "source-grammar-node-fixtures: materializes each source-grammar node's spec with its audit-tag form and Malleability",
    async () => {
      await assertProperty(
        SOURCE_GRAMMAR_TEST_GENERATOR.node(),
        async (node) => {
          await withSourceGrammarNode(node, async ({ env, nodeId, specPath }) => {
            const snapshot = await readSpecTree({
              source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
            });
            const read = snapshot.allNodes.find((candidate) => candidate.id === nodeId);
            expect(read).toBeDefined();
            expect(auditReferencesOf(read?.evidenceReferences ?? [])).toEqual(expectedAuditReferences(node));
            expect(
              read?.evidenceReferences
                .filter((reference) => reference.verificationType === SPEC_TREE_VERIFICATION_TYPE.TEST)
                .map((reference) => reference.key),
            ).toEqual([{ kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path: sourceGrammarTestReference(node) }]);
            const specText = await env.readFile(specPath);
            const pathlessTag = pathlessTagOf(node);
            if (pathlessTag !== undefined) expect(specText).toContain(pathlessTag);
            expect(declaredMalleabilityOf(specText, specPath)).toBe(node.facts.malleability);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it(
    "source-grammar-node-repositories: commits the spec, its passing test and subject, and answers every required result as passed",
    async () => {
      await assertProperty(
        SOURCE_GRAMMAR_TEST_GENERATOR.nodeRepository(),
        async (fixture) => {
          await withSourceGrammarNodeRepository(fixture, async (repository) => {
            const productDir = repository.env.productDir;
            expect(await indexedPaths(productDir)).toEqual(
              expect.arrayContaining([repository.specPath, repository.testPath, repository.subjectPath]),
            );
            expect(await runFixtureGit(productDir, [...GIT_STATUS_PORCELAIN_ARGS])).toHaveLength(0);

            const specText = await repository.env.readFile(repository.specPath);
            expect(declaredMalleabilityOf(specText, repository.specPath)).toBe(fixture.node.facts.malleability);
            const pathlessTag = pathlessTagOf(fixture.node);
            if (pathlessTag !== undefined) expect(specText).toContain(pathlessTag);
            const snapshot = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) });
            expect(
              snapshot.allNodes
                .find((candidate) => candidate.id === repository.nodeId)
                ?.evidenceReferences.filter((reference) =>
                  reference.verificationType === SPEC_TREE_VERIFICATION_TYPE.TEST
                ),
            ).toEqual([{
              verificationType: SPEC_TREE_VERIFICATION_TYPE.TEST,
              key: { kind: SPEC_TREE_EVIDENCE_KEY_KIND.PATH, path: sourceGrammarTestReference(fixture.node) },
              target: SPEC_TREE_EVIDENCE_TARGET.RESOLVED,
            }]);
            const testFixtureBytes = await readFile(CLASSIFICATION_FIXTURE_PATHS.test);
            expect(Buffer.from(await repository.env.readFile(repository.testPath))).toEqual(testFixtureBytes);

            await expect(repository.resolveOutcome(repository.nodeId, [repository.testPath])).resolves.toEqual({
              [repository.testPath]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            });
            const attributed = await repository.resolveAttributedResults(repository.nodeId, {
              auditRuleSlugs: [fixture.node.auditSlug],
              evidenceKinds: [NODE_STATUS_CLAIM_SECTION.TEST],
            });
            expect(attributed.audit?.[fixture.node.auditSlug]?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
            expect(attributed.evidence?.[NODE_STATUS_CLAIM_SECTION.TEST]?.verdict).toBe(
              NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
            );
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it(
    "tracking-scope: tracks every declared spec, evidence and EXCLUDE file, and nothing outside spx/, through both tracking paths",
    async () => {
      await assertProperty(
        NODE_STATUS_TEST_GENERATOR.classificationTree(),
        async (fixture) => {
          await withClassificationTree(fixture, async ({ env, expectations, commitProjection }) => {
            const declared = [
              ...fixture.nodes.map((node) =>
                [
                  SPEC_TREE_CONFIG.ROOT_DIRECTORY,
                  node.dirName,
                  `${node.slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`,
                ]
                  .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)
              ),
              ...expectations.flatMap((expectation) => expectation.evidencePaths),
              ...(fixture.nodes.some((node) => node.facts.isExcluded)
                ? [[SPEC_TREE_CONFIG.ROOT_DIRECTORY, SPEC_TREE_GRAMMAR.EXCLUSION_REGISTRY_FILENAME].join(
                  SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
                )]
                : []),
            ];
            const specTreePrefix = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

            const trackedBySpecTree = await indexedPaths(env.productDir);
            expect([...trackedBySpecTree].sort(compareAsciiStrings)).toEqual([...declared].sort(compareAsciiStrings));

            await commitProjection();
            const trackedByProjection = await indexedPaths(env.productDir);
            expect(trackedByProjection).toEqual(expect.arrayContaining(declared));
            for (const path of trackedByProjection) expect(path.startsWith(specTreePrefix)).toBe(true);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );

  it("generates untracked node-status paths whose node directories carry readable slugs", () => {
    assertProperty(
      NODE_STATUS_TEST_GENERATOR.untrackedNodeStatusPath(),
      (statusPath) => {
        const entry = recognizeSpecTreeFilesystemEntry({
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: posix.dirname(statusPath),
        }, migratingRecognitionOptions());
        expect(entry?.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        const slug = entry?.type === SPEC_TREE_ENTRY_TYPE.NODE ? entry.slug : undefined;
        expect(NODE_STATUS_READABLE_SLUGS).toContain(slug);
        expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
