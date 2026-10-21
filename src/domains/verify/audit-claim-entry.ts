import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { AUDIT_KIND, type AuditKind, type AuditScopeUnit, type VerifyVerifier } from "@/domains/verify/verify";
import { NODE_STATUS_MALLEABILITY, type NodeStatusMalleability } from "@/lib/node-status";

/** The kinds of linked evidence a node's claim records an `evidence` entry for. */
export const CLAIM_EVIDENCE_KIND = {
  TEST: "test",
  EVAL: "eval",
} as const;

export type ClaimEvidenceKind = (typeof CLAIM_EVIDENCE_KIND)[keyof typeof CLAIM_EVIDENCE_KIND];

/** The claim sections an audit run yields an entry for. */
export const AUDIT_CLAIM_ENTRY_SECTION = {
  AUDIT: "audit",
  EVIDENCE: "evidence",
} as const;

export type AuditClaimEntrySection = (typeof AUDIT_CLAIM_ENTRY_SECTION)[keyof typeof AUDIT_CLAIM_ENTRY_SECTION];

/** The verdicts a sealed audit run records in the claim. */
export const AUDIT_CLAIM_VERDICT = {
  PASSED: "passed",
  FAILED: "failed",
} as const;

export type AuditClaimVerdict = (typeof AUDIT_CLAIM_VERDICT)[keyof typeof AUDIT_CLAIM_VERDICT];

const VERDICT_BY_TERMINAL_STATUS: ReadonlyMap<string, AuditClaimVerdict> = new Map([
  [JOURNAL_RUN_STATE_STATUS.APPROVED, AUDIT_CLAIM_VERDICT.PASSED],
  [JOURNAL_RUN_STATE_STATUS.REJECTED, AUDIT_CLAIM_VERDICT.FAILED],
]);

const EVIDENCE_KIND_BY_AUDIT_KIND: ReadonlyMap<AuditKind, ClaimEvidenceKind> = new Map([
  [AUDIT_KIND.TESTS, CLAIM_EVIDENCE_KIND.TEST],
  [AUDIT_KIND.EVAL_EVIDENCE, CLAIM_EVIDENCE_KIND.EVAL],
]);

/** The run facts the claim entry derives from: its projected state, its id, and the rule slug it audited. */
export interface AuditClaimRun {
  readonly runId: string;
  readonly sealed: boolean;
  readonly auditScopeUnits: readonly AuditScopeUnit[];
  readonly terminalStatus?: string;
  readonly verifier?: VerifyVerifier;
  readonly ruleSlug?: string;
}

/** The node facts the claim entry derives from: its malleability (only the implementation layer requires evidence audits) and the kinds of evidence its spec links. */
export interface AuditClaimNode {
  readonly malleability: NodeStatusMalleability;
  readonly linkedEvidenceKinds: readonly ClaimEvidenceKind[];
}

/** A claim entry a sealed audit run yields, keyed by rule slug in `audit` and by evidence kind in `evidence`. */
export interface AuditClaimEntry {
  readonly section: AuditClaimEntrySection;
  readonly key: string;
  readonly verdict: AuditClaimVerdict;
  readonly actor: VerifyVerifier;
  readonly run: string;
}

/**
 * The claim entries a sealed audit run yields for a node: one `audit` entry for a rule-slug run, or
 * one `evidence` entry per linked evidence kind its units audit, in the order the units first cover
 * each kind. None when the run is unsealed, carries no Verifier or no verdict-bearing terminal
 * status, or audits only evidence the node does not require.
 */
export function auditClaimEntries(run: AuditClaimRun, node: AuditClaimNode): readonly AuditClaimEntry[] {
  if (!run.sealed || run.verifier === undefined || run.terminalStatus === undefined) return [];
  const verdict = VERDICT_BY_TERMINAL_STATUS.get(run.terminalStatus);
  if (verdict === undefined) return [];
  const identity = { verdict, actor: run.verifier, run: run.runId };
  if (run.ruleSlug !== undefined) {
    return [{ section: AUDIT_CLAIM_ENTRY_SECTION.AUDIT, key: run.ruleSlug, ...identity }];
  }
  if (node.malleability !== NODE_STATUS_MALLEABILITY.IMPLEMENTATION) return [];
  const evidenceKinds = new Set<ClaimEvidenceKind>();
  for (const unit of run.auditScopeUnits) {
    const evidenceKind = EVIDENCE_KIND_BY_AUDIT_KIND.get(unit.auditKind);
    if (evidenceKind !== undefined && node.linkedEvidenceKinds.includes(evidenceKind)) evidenceKinds.add(evidenceKind);
  }
  return [...evidenceKinds].map((key) => ({ section: AUDIT_CLAIM_ENTRY_SECTION.EVIDENCE, key, ...identity }));
}
