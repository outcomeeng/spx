import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  AUDIT_KIND,
  AUDIT_PAYLOAD_FIELD,
  type AuditKind,
  type AuditScopeUnit,
  scopeJudgedPathsOf,
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  type VerifyVerifier,
} from "@/domains/verify/verify";
import type { JournalEvent, JsonValue } from "@/lib/agent-run-journal";
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
 * The claim entries a sealed audit run yields for a node, empty when it yields none: the run is
 * unsealed, carries no Verifier or no verdict-bearing terminal status, or audits evidence the node
 * does not require. A run over a rule slug yields its one `audit` entry; any other run yields one
 * `evidence` entry for each distinct linked evidence kind its scope units audit.
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

/** The grammar of a unit that audits one Audit Assertion: the prefix, then the slug and the spec path joined by the separator. */
export const ASSERTION_AUDIT_UNIT = {
  PREFIX: "assertion:",
  SEPARATOR: ":",
} as const;

/** The verdict an Assertion audit unit folds to: a unit that records no judged path proves nothing a pin can hold. */
export const ASSERTION_AUDIT_VERDICT = {
  ...AUDIT_CLAIM_VERDICT,
  NOT_RUN: "not-run",
} as const;

export type AssertionAuditVerdict = (typeof ASSERTION_AUDIT_VERDICT)[keyof typeof ASSERTION_AUDIT_VERDICT];

/** The run facts an Assertion audit unit folds from, beside the run's identity. */
export interface AssertionAuditRun {
  readonly runId: string;
  readonly sealed: boolean;
  readonly auditScopeUnits: readonly AuditScopeUnit[];
  readonly terminalStatus?: string;
  readonly verifier?: VerifyVerifier;
  readonly blockingUnitIds: ReadonlySet<string>;
  readonly judgedPathsByUnit: ReadonlyMap<string, readonly string[]>;
}

/** The entry one Assertion audit unit yields under its slug, with the spec it audits and the paths it judged. */
export interface AssertionAuditEntry {
  readonly slug: string;
  readonly specPath: string;
  readonly verdict: AssertionAuditVerdict;
  readonly judgedPaths: readonly string[];
  readonly actor: VerifyVerifier;
  readonly run: string;
}

/** The slug and spec path an `assertion:<slug>:<spec>` unit id names, or `undefined` for any other unit. */
export function assertionAuditUnitOf(unitId: string): { readonly slug: string; readonly specPath: string } | undefined {
  if (!unitId.startsWith(ASSERTION_AUDIT_UNIT.PREFIX)) return undefined;
  const rest = unitId.slice(ASSERTION_AUDIT_UNIT.PREFIX.length);
  const separator = rest.indexOf(ASSERTION_AUDIT_UNIT.SEPARATOR);
  if (separator <= 0 || separator === rest.length - 1) return undefined;
  return { slug: rest.slice(0, separator), specPath: rest.slice(separator + 1) };
}

/**
 * The entry each Assertion audit unit of a sealed run yields, whatever the run's terminal status: a
 * unit that records no judged path folds `not-run`, a unit a blocking finding names folds `failed`,
 * and every other unit folds `passed`. A run that is unsealed, or carries no Verifier or no
 * verdict-bearing terminal status, yields none.
 */
export function assertionAuditEntries(run: AssertionAuditRun): readonly AssertionAuditEntry[] {
  if (!run.sealed || run.verifier === undefined || run.terminalStatus === undefined) return [];
  if (!VERDICT_BY_TERMINAL_STATUS.has(run.terminalStatus)) return [];
  const entries: AssertionAuditEntry[] = [];
  for (const unit of run.auditScopeUnits) {
    const assertion = assertionAuditUnitOf(unit.unitId);
    if (assertion === undefined) continue;
    const judgedPaths = run.judgedPathsByUnit.get(unit.unitId) ?? [];
    let verdict: AssertionAuditVerdict = ASSERTION_AUDIT_VERDICT.PASSED;
    if (judgedPaths.length === 0) verdict = ASSERTION_AUDIT_VERDICT.NOT_RUN;
    else if (run.blockingUnitIds.has(unit.unitId)) verdict = ASSERTION_AUDIT_VERDICT.FAILED;
    entries.push({ ...assertion, verdict, judgedPaths, actor: run.verifier, run: run.runId });
  }
  return entries;
}

/** The judged paths each audit scope unit of a run records, keyed by the unit's id; a unit that records none maps to none. */
export function scopeJudgedPathsByUnitOf(events: readonly JournalEvent[]): ReadonlyMap<string, readonly string[]> {
  const byUnit = new Map<string, readonly string[]>();
  for (const event of events) {
    if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isRecord(event.data)) continue;
    const payload = event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD];
    if (!isRecord(payload)) continue;
    const unitId = payload[AUDIT_PAYLOAD_FIELD.UNIT_ID];
    if (typeof unitId === "string") byUnit.set(unitId, scopeJudgedPathsOf(payload));
  }
  return byUnit;
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
