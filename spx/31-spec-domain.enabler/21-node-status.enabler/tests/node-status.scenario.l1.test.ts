import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNodeStatusProvider,
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_CURRENCY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
  nodeStatusClaimResults,
  readNodeStatus,
  resultCurrency,
  updateNodeStatus,
} from "@/lib/node-status";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { NODE_STATUS_TEST_GENERATOR, VARIANT_PARTITION } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createAttributedRequestRecorder,
  createConsultationRecordingResolver,
  currentMethodologyConfig,
  listNodeStatusFiles,
  migratingMethodologyConfig,
  PINNED_SPEC_FIXTURE,
  readVersion1NodeStatus,
  withClassificationTree,
  withPinnedNodeRepository,
  withVariantTree,
} from "@testing/harnesses/node-status/node-status";

describe("a tree holding a version-1 claim and a 4.0 claim", () => {
  it("reads both and reports each with its shape", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      await repository.writeClaim(repository.passedTestClaim(0));
      const versionOneDirectory = await repository.writeVersionOneSiblingClaim();
      const productDir = repository.env.productDir;

      const current = readNodeStatus(join(productDir, repository.nodePath));
      const versionOne = readNodeStatus(join(productDir, versionOneDirectory));

      expect(current?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
      expect(versionOne?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.VERSION_1);
      expect(
        current?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
          ? nodeStatusClaimResults(current.claim).map((result) => result.key)
          : undefined,
      ).toEqual([repository.testKeys[0]]);
      expect(
        versionOne?.shape === NODE_STATUS_CLAIM_SHAPE.VERSION_1
          ? versionOne.claim[NODE_STATUS_FIELD.SCHEMA_VERSION]
          : undefined,
      ).toBe(NODE_STATUS_SCHEMA_VERSION);
    });
  });
});

describe("a pinned result and a change to one path in its read set", () => {
  it("reports a Test result reading the path as not current and every result whose pin does not read it as current", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const [edited, untouched] = [
        repository.subjectPaths[fixture.editedSubject] ?? "",
        repository.subjectPaths.find((_, index) => index !== fixture.editedSubject) ?? "",
      ];
      const readingEdited = repository.passedEntry([repository.specPath, repository.testPaths[0] ?? "", edited]);
      const notReadingEdited = repository.passedEntry([
        repository.specPath,
        repository.testPaths[1] ?? "",
        untouched,
      ]);
      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, readingEdited, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.CURRENT,
      );

      await repository.editSubject(fixture.editedSubject);

      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, readingEdited, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.NOT_CURRENT,
      );
      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, notReadingEdited, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.CURRENT,
      );
    });
  });
});

describe("given a pinned result whose commit Git cannot compare with the checkout", () => {
  it("when node status is read, reports the result as not current and the node does not derive passing", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const absentCommit = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.commitId());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const read = [repository.specPath, repository.testPaths[0] ?? "", repository.subjectPaths[0] ?? ""];
      const claimOf = (entry: ReturnType<typeof repository.passedEntry>) => ({
        [NODE_STATUS_CLAIM_SECTION.TEST]: { [repository.testKeys[0] ?? ""]: entry },
      });

      await repository.writeClaim(claimOf(repository.passedEntry(read)), SPEC_TREE_NODE_STATE.PASSING);
      await repository.commitAll();
      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.PASSING);

      const unreachable = { ...repository.passedEntry(read), [NODE_STATUS_CLAIM_FIELD.COMMIT]: absentCommit };
      await repository.writeClaim(claimOf(unreachable), SPEC_TREE_NODE_STATE.PASSING);
      await repository.commitAll();

      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, unreachable, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.NOT_CURRENT,
      );
      expect(await repository.readState()).not.toBe(SPEC_TREE_NODE_STATE.PASSING);
    });
  });
});

describe("a pinned Audit result and a link-format edit to the node's spec", () => {
  it("keeps the Audit result current and reports every Test result whose pin reads the spec as not current", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      const audit = repository.passedEntry([repository.specPath, subject]);
      const test = repository.passedEntry([repository.specPath, repository.testPaths[0] ?? "", subject]);

      await repository.rewriteSpecLinksTreeAbsolute();

      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.AUDIT, audit, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.CURRENT,
      );
      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, test, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.NOT_CURRENT,
      );

      await repository.editSpecText();

      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.AUDIT, audit, repository.pinChanges)).toBe(
        NODE_STATUS_CURRENCY.NOT_CURRENT,
      );
    });
  });
});

describe("a parent whose variants' claims carry its entries", () => {
  it("is passing only when every variant's copies pass, and its own claim carries no results", async () => {
    for (const partition of Object.values(VARIANT_PARTITION)) {
      await withVariantTree(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.variantParent(partition)),
        currentMethodologyConfig(),
        async (tree) => {
          await tree.recordClaims();
          const snapshot = await readSpecTree({
            source: createFilesystemSpecTreeSource({ productDir: tree.env.productDir }),
            evidence: await createNodeStatusProvider(tree.env.productDir, { gitDependencies: tree.git }),
          });
          const parentClaim = readNodeStatus(
            join(tree.env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, tree.parentId),
          );

          expect(
            snapshot.allNodes.find((node) => node.id === tree.parentId)?.state === SPEC_TREE_NODE_STATE.PASSING,
            partition,
          ).toBe(tree.variants.every((variant) => variant.passes));
          expect(
            parentClaim?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
              ? nodeStatusClaimResults(parentClaim.claim)
              : undefined,
            partition,
          ).toEqual([]);
        },
      );
    }
  });
});

describe("a node whose claim recorded passing", () => {
  it("derives failing once a pinned read path changes without a declaration change, and not failing after the spec changes", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      await repository.recordPassingClaim();
      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.PASSING);

      await repository.editSubject(fixture.editedSubject);
      await repository.commitAll();
      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.FAILING);

      await repository.editSpecText();
      await repository.commitAll();
      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
    });
  });
});

describe("a node whose committed claim lost its artifact results", () => {
  it("derives failing while a current passed audit result remains", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const auditSlug = repository.auditRuleSlugs[0];
      expect(auditSlug).toBeDefined();
      if (auditSlug === undefined) return;
      await repository.recordPassingClaim();
      await repository.writeClaim(
        {
          [NODE_STATUS_CLAIM_SECTION.AUDIT]: {
            [auditSlug]: repository.passedEntry([repository.specPath]),
          },
        },
        SPEC_TREE_NODE_STATE.FAILING,
      );
      await repository.commitAll();

      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.FAILING);
    });
  });
});

describe("spx spec status --update under a 4.0 methodology over a node with linked verification", () => {
  it("records a result for each linked reference, each audit rule slug, and each evidence kind the node's malleability requires, pinned to the checked-out commit", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    for (const specFixture of Object.values(PINNED_SPEC_FIXTURE)) {
      await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
        const subject = repository.subjectPaths[0] ?? "";
        const requiredKinds = repository.declaredMalleability === NODE_STATUS_MALLEABILITY.IMPLEMENTATION
          ? repository.evidenceKinds
          : [];
        const asking = createAttributedRequestRecorder(repository.passedAttributedResults([subject]));

        await updateNodeStatus({
          productDir: repository.env.productDir,
          resolveOutcome: repository.passingOutcomes,
          resolveReadPaths: () => Promise.resolve([subject]),
          resolveAttributedResults: asking.resolveAttributedResults,
          gitDependencies: repository.git,
        });

        const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
        expect(written?.shape, specFixture).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
        if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) return;
        const results = nodeStatusClaimResults(written.claim);
        const keysOf = (section: string) =>
          results.filter((result) => result.section === section).map((result) => result.key).sort(compareAsciiStrings);

        expect(keysOf(NODE_STATUS_CLAIM_SECTION.TEST), specFixture).toEqual(
          [...repository.testKeys].sort(compareAsciiStrings),
        );
        expect(keysOf(NODE_STATUS_CLAIM_SECTION.EVAL), specFixture).toEqual(
          repository.evalPaths.map((path) => repository.testKey(path)).sort(compareAsciiStrings),
        );
        expect(keysOf(NODE_STATUS_CLAIM_SECTION.AUDIT), specFixture).toEqual(
          [...repository.auditRuleSlugs].sort(compareAsciiStrings),
        );
        expect(keysOf(NODE_STATUS_CLAIM_SECTION.EVIDENCE), specFixture).toEqual([...requiredKinds]);
        expect(asking.requests, specFixture).toEqual([
          { auditRuleSlugs: repository.auditRuleSlugs, evidenceKinds: requiredKinds },
        ]);
        expect(written.claim[NODE_STATUS_CLAIM_FIELD.MALLEABILITY], specFixture).toBe(
          repository.declaredMalleability,
        );
        for (const result of results) {
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.VERDICT], specFixture).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.COMMIT], specFixture).toBe(repository.commit);
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.READ], specFixture).toContain(repository.specPath);
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.READ], specFixture).toContain(subject);
        }
        for (
          const result of results.filter((candidate) =>
            candidate.section === NODE_STATUS_CLAIM_SECTION.AUDIT
            || candidate.section === NODE_STATUS_CLAIM_SECTION.EVIDENCE
          )
        ) {
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.ACTOR], specFixture).toEqual(repository.attribution.actor);
          expect(result.entry[NODE_STATUS_CLAIM_FIELD.RUN], specFixture).toBe(repository.attribution.run);
        }
        expect(written.claim[NODE_STATUS_CLAIM_FIELD.STATE], specFixture).toBe(SPEC_TREE_NODE_STATE.PASSING);
      }, specFixture);
    }
  });

  it("records not-run with no pin for a result whose adapter reports no read paths, and for a reference no run covers", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: repository.passingOutcomes,
        gitDependencies: repository.git,
      });

      const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      expect(
        written?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
          ? nodeStatusClaimResults(written.claim).map((result) => result.entry)
          : undefined,
      ).toEqual(
        [...repository.testPaths, ...repository.auditRuleSlugs, NODE_STATUS_CLAIM_SECTION.TEST].map(() => ({
          [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
        })),
      );
      expect(
        written?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT ? written.claim[NODE_STATUS_CLAIM_FIELD.STATE] : undefined,
      ).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
    });
  });

  it("keeps a committed entry whose pin is current and whose verdict and read set equal the run's across an unrelated commit", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      const options = {
        productDir: repository.env.productDir,
        resolveOutcome: repository.passingOutcomes,
        resolveReadPaths: () => Promise.resolve([subject]),
        gitDependencies: repository.git,
      };
      await updateNodeStatus(options);
      const before = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      await repository.commitAll();
      const laterCommit = await repository.commitUnrelatedFile();

      await updateNodeStatus(options);

      const after = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      expect(laterCommit).not.toBe(repository.commit);
      expect(after).toEqual(before);
    });
  });

  it("keeps the committed entry of a covered reference whose evidence is stale and records not-run with no pin when none is committed", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const [committedKey = "", uncommittedKey = ""] = repository.testKeys;
      const committed = repository.passedTestClaim(0);
      await repository.writeClaim(committed);

      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: () => Promise.resolve({}),
        gitDependencies: repository.git,
      });

      const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      const entries = written?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
        ? written.claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.TEST]
        : undefined;
      expect(entries?.[committedKey]).toEqual(committed[NODE_STATUS_CLAIM_SECTION.TEST]?.[committedKey]);
      expect(entries?.[uncommittedKey]).toEqual({
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      });
    });
  });
  it("keeps the committed entry of a covered reference whose pin commit Git cannot compare, reports it as not current without deriving passing, and replaces it once a run covers it", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const absentCommit = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.commitId());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      const unreachable = {
        ...repository.passedEntry([repository.specPath, repository.testPaths[0] ?? "", subject]),
        [NODE_STATUS_CLAIM_FIELD.COMMIT]: absentCommit,
      };
      const key = repository.testKeys[0] ?? "";
      await repository.writeClaim({ [NODE_STATUS_CLAIM_SECTION.TEST]: { [key]: unreachable } });
      await repository.commitAll();
      const entryOf = () => {
        const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
        return written?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT ? written.claim : undefined;
      };

      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: () => Promise.resolve({}),
        gitDependencies: repository.git,
      });
      const kept = entryOf();
      const keptEntry = kept?.[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.TEST]?.[key];
      expect(keptEntry).toBeDefined();
      expect(await resultCurrency(NODE_STATUS_CLAIM_SECTION.TEST, keptEntry ?? unreachable, repository.pinChanges))
        .toBe(NODE_STATUS_CURRENCY.NOT_CURRENT);
      expect(kept?.[NODE_STATUS_CLAIM_FIELD.STATE]).not.toBe(SPEC_TREE_NODE_STATE.PASSING);

      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: repository.passingOutcomes,
        resolveReadPaths: () => Promise.resolve([subject]),
        gitDependencies: repository.git,
      });
      const refolded = entryOf()?.[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.TEST]?.[key];
      expect(refolded?.[NODE_STATUS_CLAIM_FIELD.COMMIT]).not.toBe(absentCommit);
      expect(refolded).not.toEqual(unreachable);
    });
  });

  it("keeps a committed eval, audit or evidence entry whose pin is current when no recorded run covers it, and writes not-run with no pin for a committed test entry no recorded run covers", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const subject = repository.subjectPaths[0] ?? "";
      const attributed = () => ({
        ...repository.passedEntry([repository.specPath, subject]),
        ...repository.attribution,
      });
      const committed = {
        [NODE_STATUS_CLAIM_SECTION.TEST]: Object.fromEntries(
          repository.testPaths.map((path) => [
            repository.testKey(path),
            repository.passedEntry([repository.specPath, path, subject]),
          ]),
        ),
        [NODE_STATUS_CLAIM_SECTION.EVAL]: Object.fromEntries(
          repository.evalPaths.map((path) => [
            repository.testKey(path),
            repository.passedEntry([repository.specPath, path, subject]),
          ]),
        ),
        [NODE_STATUS_CLAIM_SECTION.AUDIT]: Object.fromEntries(
          repository.auditRuleSlugs.map((slug) => [slug, attributed()]),
        ),
        [NODE_STATUS_CLAIM_SECTION.EVIDENCE]: Object.fromEntries(
          repository.evidenceKinds.map((kind) => [kind, attributed()]),
        ),
      };
      await repository.writeClaim(committed);

      await updateNodeStatus({
        productDir: repository.env.productDir,
        resolveOutcome: (_nodeId, evidencePaths) =>
          Promise.resolve(
            Object.fromEntries(evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN])),
          ),
        resolveAttributedResults: () => Promise.resolve({}),
        gitDependencies: repository.git,
      });

      const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      const verification = written?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
        ? written.claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION]
        : undefined;
      expect(verification?.[NODE_STATUS_CLAIM_SECTION.TEST]).toEqual(
        Object.fromEntries(
          repository.testKeys.map((
            key,
          ) => [key, { [NODE_STATUS_CLAIM_FIELD.VERDICT]: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN }]),
        ),
      );
      expect(verification?.[NODE_STATUS_CLAIM_SECTION.EVAL]).toEqual(committed[NODE_STATUS_CLAIM_SECTION.EVAL]);
      expect(verification?.[NODE_STATUS_CLAIM_SECTION.AUDIT]).toEqual(committed[NODE_STATUS_CLAIM_SECTION.AUDIT]);
      expect(verification?.[NODE_STATUS_CLAIM_SECTION.EVIDENCE]).toEqual(committed[NODE_STATUS_CLAIM_SECTION.EVIDENCE]);
    }, PINNED_SPEC_FIXTURE.EVAL_LINKED);
  });
});

describe("a node with no spx.status.json", () => {
  it("derives its lifecycle state live instead of reading a file", async () => {
    await withClassificationTree(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.classificationTreeWithVerificationReferences()),
      async ({ env, expectations }) => {
        expect(await listNodeStatusFiles(env.productDir)).toEqual([]);

        const provider = await createNodeStatusProvider(env.productDir);
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
          const recorded = readVersion1NodeStatus(
            join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, expectation.nodeId),
          );
          expect(recorded?.[NODE_STATUS_FIELD.SCHEMA_VERSION]).toBe(NODE_STATUS_SCHEMA_VERSION);
          expect(recorded?.[NODE_STATUS_FIELD.VERIFICATION]).toEqual(
            expectation.evidencePaths.length === 0 ? {} : {
              [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
                [NODE_STATUS_FIELD.OVERALL]: expectation.facts.expectedMechanismOverall,
                ...Object.fromEntries(
                  expectation.evidencePaths.map((path) => [path, expectation.facts.expectedEvidenceOutcome]),
                ),
              },
            },
          );
        }

        const projected = await readSpecTree({
          source: createFilesystemSpecTreeSource({ productDir: env.productDir }),
          evidence: await createNodeStatusProvider(env.productDir),
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

describe("given a product migrating from 3.2 and a source-grammar node that declares no malleability, whose linked tests pass and whose claim carries no evidence-audit result", () => {
  it("when node status is read, does not derive passing", async () => {
    const { node, facts } = sampleGeneratedValue(
      NODE_STATUS_TEST_GENERATOR.untaggedUndeclaredSourceGrammarRepository(),
    );
    await withPinnedNodeRepository(node, migratingMethodologyConfig(), async (repository) => {
      await repository.updateStatusAndCommit(false);

      expect(await repository.readState()).toBe(SPEC_TREE_NODE_STATE.SPECIFIED);
    }, facts);
  });
});
