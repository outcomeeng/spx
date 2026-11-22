import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { ASSERTION_AUDIT_SCENARIO } from "@testing/fixtures/node-status/assertion-audit-scenario";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withAssertionAuditRepository } from "@testing/harnesses/node-status/assertion-audit";
import { PINNED_SPEC_FIXTURE } from "@testing/harnesses/node-status/node-status";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

describe("assertion-audit-fold: each assertion unit of a sealed audit run folds into its own audit entry", () => {
  it(
    "approved-run: a unit with no blocking finding and judged paths in an approved run folds passed and pinned",
    async () => {
      await withAssertionAuditRepository(
        sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
        PINNED_SPEC_FIXTURE.DEFAULT,
        async (fold) => {
          const [slug = ""] = fold.repository.auditRuleSlugs;
          const [subject = ""] = fold.repository.subjectPaths;
          const recorded = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [
            { slug, judgedPaths: [subject], blocking: false },
          ]);
          const head = await fold.headCommit();
          await fold.projectAndCommit();
          const entry = await fold.auditEntry(slug);
          expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
          expect(entry?.run).toBe(recorded.run);
          expect(entry?.actor).toEqual(recorded.verifier);
          expect(entry?.commit).toBe(head);
          expect(new Set(entry?.read)).toEqual(new Set([fold.repository.specPath, subject]));
        },
      );
    },
    PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS,
  );

  it("rejected-run-clean-unit and finding-on-unit: a rejected run folds each unit by its own findings", async () => {
    await withAssertionAuditRepository(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
      PINNED_SPEC_FIXTURE.DEFAULT,
      async (fold) => {
        const [clean = "", flagged = ""] = fold.repository.auditRuleSlugs;
        const [subject = ""] = fold.repository.subjectPaths;
        const recorded = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.REJECTED, [
          { slug: clean, judgedPaths: [subject], blocking: false },
          { slug: flagged, judgedPaths: [subject], blocking: true },
        ]);
        await fold.projectAndCommit();
        const cleanEntry = await fold.auditEntry(clean);
        const flaggedEntry = await fold.auditEntry(flagged);
        expect(cleanEntry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
        expect(flaggedEntry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
        for (const entry of [cleanEntry, flaggedEntry]) {
          expect(entry?.run).toBe(recorded.run);
          expect(new Set(entry?.read)).toEqual(new Set([fold.repository.specPath, subject]));
        }
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);

  it("no-judged-paths: a unit that records no judged path folds not-run with no pin", async () => {
    await withAssertionAuditRepository(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
      PINNED_SPEC_FIXTURE.DEFAULT,
      async (fold) => {
        const [slug = ""] = fold.repository.auditRuleSlugs;
        await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [{ slug, judgedPaths: [], blocking: false }]);
        await fold.projectAndCommit();
        const entry = await fold.auditEntry(slug);
        expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
        expect(entry?.commit).toBeUndefined();
        expect(entry?.read).toBeUndefined();
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);

  it("newer-run-same-slug: the newer run with a current pin folds, and the older run folds nowhere", async () => {
    await withAssertionAuditRepository(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
      PINNED_SPEC_FIXTURE.DEFAULT,
      async (fold) => {
        const [slug = ""] = fold.repository.auditRuleSlugs;
        const [subject = ""] = fold.repository.subjectPaths;
        const older = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [
          { slug, judgedPaths: [subject], blocking: false },
        ]);
        const newer = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.REJECTED, [
          { slug, judgedPaths: [subject], blocking: true },
        ]);
        await fold.projectAndCommit();
        const entry = await fold.auditEntry(slug);
        expect(entry?.run).toBe(newer.run);
        expect(entry?.run).not.toBe(older.run);
        expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);

  it("stale-pin: a run whose judged paths changed since its commit yields no entry", async () => {
    await withAssertionAuditRepository(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
      PINNED_SPEC_FIXTURE.DEFAULT,
      async (fold) => {
        const [slug = ""] = fold.repository.auditRuleSlugs;
        const [subject = ""] = fold.repository.subjectPaths;
        const recorded = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [
          { slug, judgedPaths: [subject], blocking: false },
        ]);
        await fold.commitSubjectChange(subject);
        await fold.projectAndCommit();
        const entry = await fold.auditEntry(slug);
        expect(entry?.run).not.toBe(recorded.run);
        expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);
});

describe("assertion-audit-fold: which run and which rows fold", () => {
  const scenarioNode = () => {
    const { node, judgedPath, otherSubject } = ASSERTION_AUDIT_SCENARIO;
    return { dirName: node.dirName, slug: node.slug, subjectPaths: [judgedPath, otherSubject], editedSubject: 0 };
  };

  it("no-judged-paths: a newer unit that judged no path leaves an older run with a current pin folding", async () => {
    await withAssertionAuditRepository(
      sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode()),
      PINNED_SPEC_FIXTURE.DEFAULT,
      async (fold) => {
        const [slug = ""] = fold.repository.auditRuleSlugs;
        const [subject = ""] = fold.repository.subjectPaths;
        const older = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [
          { slug, judgedPaths: [subject], blocking: false },
        ]);
        await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [{ slug, judgedPaths: [], blocking: false }]);
        await fold.projectAndCommit();
        const entry = await fold.auditEntry(slug);
        expect(entry?.run).toBe(older.run);
        expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);

  it("folds the 4.0 Audit rows of a spec whose Audit group heading stands at level 2", async () => {
    const { cleanRow, judgedPath } = ASSERTION_AUDIT_SCENARIO;
    await withAssertionAuditRepository(scenarioNode(), PINNED_SPEC_FIXTURE.AUDIT_ROWS_LEVEL_TWO, async (fold) => {
      const recorded = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.APPROVED, [
        { slug: cleanRow, judgedPaths: [judgedPath], blocking: false },
      ]);
      await fold.projectAndCommit();
      const entry = await fold.auditEntry(cleanRow);
      expect(entry?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      expect(entry?.run).toBe(recorded.run);
    });
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);

  it("keeps every 4.0 Audit row no run yields in the claim as not-run", async () => {
    const { cleanRow, findingRow } = ASSERTION_AUDIT_SCENARIO;
    await withAssertionAuditRepository(scenarioNode(), PINNED_SPEC_FIXTURE.AUDIT_ROWS, async (fold) => {
      await fold.projectAndCommit();
      const entries = await fold.auditEntries();
      expect(new Set(entries.map((entry) => entry.key))).toEqual(new Set([cleanRow, findingRow]));
      for (const entry of entries) expect(entry.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
    });
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);
});
