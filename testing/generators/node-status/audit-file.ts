/**
 * Cases and spec-stated expectations for the node-status Audit File vocabulary: the path of the Audit
 * File of each claim entry the `audit-file-path` table names, and the Audit File keys and finding keys
 * `audit-file-keys-exported` names.
 *
 * Each expected path and key is the node-status spec's statement read directly, held as local
 * statement literals apart from the vocabulary module and the spec-tree grammar registry it composes
 * from, so a misspelled, missing, or extra name in either leaves the expectation standing.
 *
 * @module generators/node-status/audit-file
 */

import type { NodeStatusAuditFileEntry } from "@/lib/node-status";
import { NODE_STATUS_CLAIM_SECTION } from "@/lib/node-status";
import { arbitrarySlug } from "@testing/generators/spec-tree/lane-directories";
import { sampleSpecTreeTestValue } from "@testing/generators/spec-tree/spec-tree";

/** The Audit File keys `audit-file-keys-exported` names, as the spec writes them. */
export const AUDIT_FILE_KEY_STATEMENT = ["key", "run", "verdict", "actor", "commit", "read", "findings"] as const;

/** The finding keys `audit-file-keys-exported` names, as the spec writes them. */
export const AUDIT_FINDING_KEY_STATEMENT = [
  "artifact",
  "location",
  "rule",
  "verdict",
  "message",
  "observed",
  "expected",
] as const;

/** The paths the `audit-file-path` table states, as the spec writes them. */
const AUDIT_FILE_PATH_STATEMENT = {
  auditDirectory: "audits/",
  auditExtension: ".json",
  evidenceTest: "audits/evidence/test.json",
  evidenceEval: "audits/evidence/eval.json",
} as const;

/** One row of the `audit-file-path` table: the claim entry an Audit File records and its node-relative path. */
export type AuditFilePathCase = {
  readonly title: string;
  readonly entry: NodeStatusAuditFileEntry;
  readonly expected: string;
};

const SLUG_DRAW_COUNT = 5;
const SLUG_DRAW_BASE = 1;

function pathCase(row: string, entry: NodeStatusAuditFileEntry, expected: string): AuditFilePathCase {
  return { title: `${row}: the ${entry.section} entry keyed by ${entry.key} maps to ${expected}`, entry, expected };
}

/**
 * Each row of the `audit-file-path` table: an `audit` entry keyed by a generated slug, and the
 * `evidence` entries keyed by `test` and by `eval`.
 */
export function auditFilePathCases(): readonly AuditFilePathCase[] {
  const { auditDirectory, auditExtension, evidenceTest, evidenceEval } = AUDIT_FILE_PATH_STATEMENT;
  const slugs = Array.from(
    { length: SLUG_DRAW_COUNT },
    (_, draw) => sampleSpecTreeTestValue(arbitrarySlug(), SLUG_DRAW_BASE + draw),
  );
  return [
    ...slugs.map((slug) =>
      pathCase(
        "audit-entry",
        { section: NODE_STATUS_CLAIM_SECTION.AUDIT, key: slug },
        `${auditDirectory}${slug}${auditExtension}`,
      )
    ),
    pathCase(
      "evidence-test",
      { section: NODE_STATUS_CLAIM_SECTION.EVIDENCE, key: NODE_STATUS_CLAIM_SECTION.TEST },
      evidenceTest,
    ),
    pathCase(
      "evidence-eval",
      { section: NODE_STATUS_CLAIM_SECTION.EVIDENCE, key: NODE_STATUS_CLAIM_SECTION.EVAL },
      evidenceEval,
    ),
  ];
}
