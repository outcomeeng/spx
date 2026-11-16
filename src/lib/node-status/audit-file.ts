import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

import { NODE_STATUS_CLAIM_SECTION } from "./claim";

/** The keys of an Audit File, the JSON object that records one Verification Run of an Audit beside its claim entry. */
export const NODE_STATUS_AUDIT_FILE_KEY = {
  KEY: "key",
  RUN: "run",
  VERDICT: "verdict",
  ACTOR: "actor",
  COMMIT: "commit",
  READ: "read",
  FINDINGS: "findings",
} as const;

export type NodeStatusAuditFileKey = (typeof NODE_STATUS_AUDIT_FILE_KEY)[keyof typeof NODE_STATUS_AUDIT_FILE_KEY];

/** The keys of each finding an Audit File holds under its `findings` key. */
export const NODE_STATUS_AUDIT_FINDING_KEY = {
  ARTIFACT: "artifact",
  LOCATION: "location",
  RULE: "rule",
  VERDICT: "verdict",
  MESSAGE: "message",
  OBSERVED: "observed",
  EXPECTED: "expected",
} as const;

export type NodeStatusAuditFindingKey =
  (typeof NODE_STATUS_AUDIT_FINDING_KEY)[keyof typeof NODE_STATUS_AUDIT_FINDING_KEY];

/** One finding of an Audit File, under the finding keys. */
export type NodeStatusAuditFinding = Readonly<Record<NodeStatusAuditFindingKey, string>>;

/** The kinds of evidence an `evidence` entry, and so its Audit File, is keyed by. */
export type NodeStatusAuditFileEvidenceKind =
  | typeof NODE_STATUS_CLAIM_SECTION.TEST
  | typeof NODE_STATUS_CLAIM_SECTION.EVAL;

/** The claim entry an Audit File records: an `audit` entry keyed by its rule slug, or an `evidence` entry keyed by its kind. */
export type NodeStatusAuditFileEntry =
  | { readonly section: typeof NODE_STATUS_CLAIM_SECTION.AUDIT; readonly key: string }
  | { readonly section: typeof NODE_STATUS_CLAIM_SECTION.EVIDENCE; readonly key: NodeStatusAuditFileEvidenceKind };

const AUDIT_FILE_GRAMMAR = SPEC_TREE_GRAMMAR.AUDIT;

const EVIDENCE_AUDIT_FILENAME: Readonly<Record<NodeStatusAuditFileEvidenceKind, string>> = {
  [NODE_STATUS_CLAIM_SECTION.TEST]: AUDIT_FILE_GRAMMAR.EVIDENCE.TEST_FILENAME,
  [NODE_STATUS_CLAIM_SECTION.EVAL]: AUDIT_FILE_GRAMMAR.EVIDENCE.EVAL_FILENAME,
};

/**
 * The path of the Audit File of a claim entry, relative to the directory of its node, composed from the
 * Audit File names the spec-tree grammar declares: `audits/{slug}.json` for an `audit` entry, and
 * `audits/evidence/test.json` or `audits/evidence/eval.json` for an `evidence` entry.
 */
export function nodeStatusAuditFilePath(entry: NodeStatusAuditFileEntry): string {
  const segments = entry.section === NODE_STATUS_CLAIM_SECTION.AUDIT
    ? [AUDIT_FILE_GRAMMAR.DIRECTORY_NAME, `${entry.key}${AUDIT_FILE_GRAMMAR.FILE_EXTENSION}`]
    : [
      AUDIT_FILE_GRAMMAR.DIRECTORY_NAME,
      AUDIT_FILE_GRAMMAR.EVIDENCE.DIRECTORY_NAME,
      EVIDENCE_AUDIT_FILENAME[entry.key],
    ];
  return segments.join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}
