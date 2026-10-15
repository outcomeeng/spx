import { dirname, join, posix } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  claimShapeOfMethodologyVersion,
  NODE_STATUS_ACTOR_KIND,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  nodeStatusClaimResults,
  readNodeStatus,
  updateNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR, type RecordedRun } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  methodologyDeclaringConfig,
  readNodeStatusFileBytes,
  withPinnedNodeRepository,
  withStatusWriterTree,
} from "@testing/harnesses/node-status/node-status";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";

describe("every spx.status.json the writer produces under a 4.0 methodology", () => {
  it(
    "parses as a 4.0 claim of state, malleability, and verification results in the status vocabulary, keyed by the node-relative paths of the node's linked evidence, with no overall rollup",
    async () => {
      await assertProperty(
        fc.tuple(
          NODE_STATUS_TEST_GENERATOR.statusWriterTree(),
          NODE_STATUS_TEST_GENERATOR.methodologyVersion(NODE_STATUS_CLAIM_SHAPE.CURRENT),
        ),
        async ([fixture, version]) => {
          await withStatusWriterTree(
            fixture,
            async ({ env, expectations, resolveOutcome }) => {
              await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

              const written = await readNodeStatusFileBytes(env.productDir);
              for (const expectation of expectations) {
                const text = String(written[expectation.statusPath]);
                const document = JSON.parse(text) as Readonly<Record<string, unknown>>;
                expect(Object.keys(document).sort(compareAsciiStrings)).toEqual(
                  [
                    NODE_STATUS_CLAIM_FIELD.STATE,
                    NODE_STATUS_CLAIM_FIELD.MALLEABILITY,
                    NODE_STATUS_CLAIM_FIELD.VERIFICATION,
                  ]
                    .sort(compareAsciiStrings),
                );
                expect(Object.values(SPEC_TREE_NODE_STATE)).toContain(document[NODE_STATUS_CLAIM_FIELD.STATE]);
                expect(Object.values(NODE_STATUS_MALLEABILITY)).toContain(
                  document[NODE_STATUS_CLAIM_FIELD.MALLEABILITY],
                );
                expect(text).not.toContain(NODE_STATUS_FIELD.OVERALL);

                const read = readNodeStatus(dirname(join(env.productDir, expectation.statusPath)));
                expect(read?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
                const results = read?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
                  ? nodeStatusClaimResults(read.claim)
                  : [];
                const keysOf = (section: string) =>
                  results
                    .filter((result) => result.section === section)
                    .map((result) => result.key)
                    .sort(compareAsciiStrings);
                expect(keysOf(NODE_STATUS_CLAIM_SECTION.TEST)).toEqual(
                  expectation.evidencePaths
                    .map((path) => posix.relative(dirname(expectation.statusPath), path))
                    .sort(compareAsciiStrings),
                );
                expect(keysOf(NODE_STATUS_CLAIM_SECTION.EVIDENCE)).toEqual(
                  expectation.evidencePaths.length === 0 ? [] : [NODE_STATUS_CLAIM_SECTION.TEST],
                );
                for (const result of results) {
                  expect(Object.values(NODE_STATUS_EVIDENCE_OUTCOME)).toContain(
                    result.entry[NODE_STATUS_CLAIM_FIELD.VERDICT],
                  );
                  expect(Object.values(NODE_STATUS_CLAIM_SECTION)).toContain(result.section);
                }
              }
            },
            methodologyDeclaringConfig(version),
          );
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});

describe("every pinned entry the writer produces under a 4.0 methodology", () => {
  it(
    "carries the checked-out commit and read paths holding the node's spec, the entry's own subjects, and its verification artifact, and every other entry reads not-run with no pin",
    async () => {
      const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
      const version = sampleGeneratedValue(
        NODE_STATUS_TEST_GENERATOR.methodologyVersion(NODE_STATUS_CLAIM_SHAPE.CURRENT),
      );
      await withPinnedNodeRepository(fixture, methodologyDeclaringConfig(version), async (repository) => {
        const attribution = {
          actor: { [NODE_STATUS_CLAIM_FIELD.ACTOR_KIND]: NODE_STATUS_ACTOR_KIND.AGENT, id: fixture.slug },
          run: fixture.dirName,
        };
        const testKeyOf = (path: string) => posix.relative(repository.nodePath, path);
        await assertProperty(
          fc.record({
            tests: NODE_STATUS_TEST_GENERATOR.recordedRuns(repository.subjectPaths, repository.testPaths),
            audit: NODE_STATUS_TEST_GENERATOR.recordedRuns(repository.subjectPaths, repository.auditRuleSlugs, true),
            evidence: NODE_STATUS_TEST_GENERATOR.recordedRuns(
              repository.subjectPaths,
              [NODE_STATUS_CLAIM_SECTION.TEST],
              true,
            ),
          }),
          async ({ tests, audit, evidence }) => {
            const attributed = (runs: Readonly<Record<string, RecordedRun | undefined>>) =>
              Object.fromEntries(
                Object.entries(runs).flatMap(([key, run]) =>
                  run === undefined ? [] : [[key, { ...run, ...attribution }] as const]
                ),
              );
            await updateNodeStatus({
              productDir: repository.env.productDir,
              resolveOutcome: (_nodeId, evidencePaths) =>
                Promise.resolve(
                  Object.fromEntries(
                    evidencePaths.map((path) => [path, tests[path]?.verdict ?? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN]),
                  ),
                ),
              resolveReadPaths: (_nodeId, evidencePath) => Promise.resolve(tests[evidencePath]?.read),
              resolveAttributedResults: () =>
                Promise.resolve({ audit: attributed(audit), evidence: attributed(evidence) }),
              gitDependencies: repository.git,
            });

            const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
            expect(written?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
            if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) return;
            const expected = [
              ...repository.testPaths.map((path) => ({
                section: NODE_STATUS_CLAIM_SECTION.TEST,
                key: testKeyOf(path),
                run: tests[path],
                declared: [repository.specPath, path],
              })),
              ...repository.auditRuleSlugs.map((slug) => ({
                section: NODE_STATUS_CLAIM_SECTION.AUDIT,
                key: slug,
                run: audit[slug],
                declared: [repository.specPath],
              })),
              {
                section: NODE_STATUS_CLAIM_SECTION.EVIDENCE,
                key: NODE_STATUS_CLAIM_SECTION.TEST,
                run: evidence[NODE_STATUS_CLAIM_SECTION.TEST],
                declared: [repository.specPath],
              },
            ];
            const results = nodeStatusClaimResults(written.claim);
            expect(results.length).toBe(expected.length);
            for (const { section, key, run, declared } of expected) {
              const entry = results.find((result) => result.section === section && result.key === key)?.entry;
              const pinned = run !== undefined
                && run.verdict !== NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
                && run.read.length > 0;
              if (!pinned) {
                expect(entry).toEqual({ [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN });
                continue;
              }
              expect(entry?.[NODE_STATUS_CLAIM_FIELD.VERDICT]).toBe(run.verdict);
              expect(entry?.[NODE_STATUS_CLAIM_FIELD.COMMIT]).toBe(repository.commit);
              expect([...(entry?.[NODE_STATUS_CLAIM_FIELD.READ] ?? [])].sort(compareAsciiStrings)).toEqual(
                [...new Set([...declared, ...run.read])].sort(compareAsciiStrings),
              );
              expect(entry?.[NODE_STATUS_CLAIM_FIELD.READ]).toContain(repository.specPath);
            }
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});

describe("the claim shape of a declared methodology version", () => {
  it("is the 4.0 shape exactly for a version of the 4.0 line or later", async () => {
    await assertProperty(
      fc.constantFrom(...Object.values(NODE_STATUS_CLAIM_SHAPE)).chain((shape) =>
        NODE_STATUS_TEST_GENERATOR.methodologyVersion(shape).map((version) => ({ shape, version }))
      ),
      ({ shape, version }) => {
        expect(claimShapeOfMethodologyVersion(version)).toBe(shape);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});

describe("every spx.status.json the writer produces", () => {
  it(
    "parses as a schema-version-1 JSON object whose verification keys, overall values, and reference outcomes stay in the status vocabulary and whose references are the node's linked evidence",
    async () => {
      await assertProperty(
        NODE_STATUS_TEST_GENERATOR.statusWriterTree(),
        async (fixture) => {
          await withStatusWriterTree(fixture, async ({ env, expectations, resolveOutcome }) => {
            await updateNodeStatus({ productDir: env.productDir, resolveOutcome });

            const written = await readNodeStatusFileBytes(env.productDir);
            expect(Object.keys(written).sort(compareAsciiStrings)).toEqual(
              expectations.map((expectation) => expectation.statusPath).sort(compareAsciiStrings),
            );

            for (const expectation of expectations) {
              const document: unknown = JSON.parse(String(written[expectation.statusPath]));
              expect(document).not.toBeNull();
              expect(Array.isArray(document)).toBe(false);
              expect(Object.getPrototypeOf(document)).toBe(Object.prototype);
              const fields = document as Readonly<Record<string, unknown>>;
              expect(Object.keys(fields).sort(compareAsciiStrings)).toEqual(
                [NODE_STATUS_FIELD.SCHEMA_VERSION, NODE_STATUS_FIELD.VERIFICATION].sort(compareAsciiStrings),
              );
              expect(fields[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);

              const verification = fields[NODE_STATUS_FIELD.VERIFICATION] as Readonly<
                Record<string, Readonly<Record<string, unknown>>>
              >;
              expect(Object.keys(verification)).toEqual(
                expectation.evidencePaths.length === 0 ? [] : [NODE_STATUS_VERIFICATION_MECHANISM.TEST],
              );
              const references: string[] = [];
              for (const [mechanism, record] of Object.entries(verification)) {
                expect(Object.values(NODE_STATUS_VERIFICATION_MECHANISM)).toContain(mechanism);
                expect(Object.values(NODE_STATUS_MECHANISM_OVERALL)).toContain(record[NODE_STATUS_FIELD.OVERALL]);
                for (const [reference, outcome] of Object.entries(record)) {
                  if (reference === NODE_STATUS_FIELD.OVERALL) continue;
                  expect(Object.values(NODE_STATUS_EVIDENCE_OUTCOME)).toContain(outcome);
                  references.push(reference);
                }
              }
              expect(references.sort(compareAsciiStrings)).toEqual(
                [...expectation.evidencePaths].sort(compareAsciiStrings),
              );
            }
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
