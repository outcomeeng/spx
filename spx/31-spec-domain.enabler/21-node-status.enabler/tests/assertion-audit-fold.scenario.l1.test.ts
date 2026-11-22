import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { ASSERTION_AUDIT_SCENARIO } from "@testing/fixtures/node-status/assertion-audit-scenario";
import { withAssertionAuditRepository } from "@testing/harnesses/node-status/assertion-audit";
import { PINNED_SPEC_FIXTURE } from "@testing/harnesses/node-status/node-status";
import { PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS } from "@testing/harnesses/property/property";

describe("one rejected run over two rows", () => {
  it("rejected-run-folds-per-row: the clean row folds passed and the flagged row failed, each pinned", async () => {
    const { node, cleanRow, findingRow, judgedPath, otherSubject } = ASSERTION_AUDIT_SCENARIO;
    await withAssertionAuditRepository(
      { dirName: node.dirName, slug: node.slug, subjectPaths: [judgedPath, otherSubject], editedSubject: 0 },
      PINNED_SPEC_FIXTURE.AUDIT_ROWS,
      async (fold) => {
        const recorded = await fold.recordRun(JOURNAL_RUN_STATE_STATUS.REJECTED, [
          { slug: cleanRow, judgedPaths: [judgedPath], blocking: false },
          { slug: findingRow, judgedPaths: [judgedPath], blocking: true },
        ]);
        const head = await fold.headCommit();
        await fold.projectAndCommit();
        const entries = await fold.auditEntries();
        expect(new Set(entries.map((entry) => entry.key))).toEqual(new Set([cleanRow, findingRow]));
        expect(entries).toHaveLength(2);
        expect((await fold.auditEntry(cleanRow))?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
        expect((await fold.auditEntry(findingRow))?.verdict).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
        for (const entry of entries) {
          expect(entry.run).toBe(recorded.run);
          expect(entry.actor).toEqual(recorded.verifier);
          expect(entry.commit).toBe(head);
          expect(new Set(entry.read)).toEqual(new Set([fold.repository.specPath, judgedPath]));
        }
      },
    );
  }, PROPERTY_L1_TEST_ENVELOPE_TIMEOUT_MS);
});
