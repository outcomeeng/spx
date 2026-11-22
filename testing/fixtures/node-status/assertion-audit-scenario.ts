/**
 * The values of the `rejected-run-folds-per-row` Scenario of spx/31-spec-domain.enabler/21-node-status.enabler:
 * the node, its two Audit rows, and the subject each unit judged.
 *
 * @module testing/fixtures/node-status/assertion-audit-scenario
 */
export const ASSERTION_AUDIT_SCENARIO = {
  node: { dirName: "20-drafts.enabler", slug: "drafts" },
  cleanRow: "no-implicit-removal",
  findingRow: "real-storage-in-tests",
  judgedPath: "src/lib/drafts.ts",
  otherSubject: "src/lib/drafts-other.ts",
} as const;
