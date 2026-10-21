import * as fc from "fast-check";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  AUDIT_CLAIM_ENTRY_SECTION,
  type AuditClaimEntry,
  type AuditClaimNode,
  type AuditClaimRun,
  CLAIM_EVIDENCE_KIND,
  type ClaimEvidenceKind,
} from "@/domains/verify/audit-claim-entry";
import { AUDIT_KIND, type AuditKind, VERIFY_VERIFIER_KIND, type VerifyVerifier } from "@/domains/verify/verify";
import { NODE_STATUS_MALLEABILITY } from "@/lib/node-status";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { arbitraryAuditScopeUnit } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";

/** The claim entry minus its verdict: the assertion states the entry, actor, and run, and no verdict. */
export type ExpectedAuditClaimEntry = Omit<AuditClaimEntry, "verdict">;

interface ExpectedIdentity {
  readonly actor: VerifyVerifier;
  readonly run: string;
}

export interface AuditClaimEntryMappingCase {
  readonly title: string;
  readonly run: AuditClaimRun;
  readonly node: AuditClaimNode;
  readonly expected: readonly ExpectedAuditClaimEntry[];
}

/** The sealed terminal statuses an audit run seals with. */
const SEALED_TERMINAL_STATUSES = [JOURNAL_RUN_STATE_STATUS.APPROVED, JOURNAL_RUN_STATE_STATUS.REJECTED] as const;

/** The audit kinds that audit linked evidence, each beside the kind of evidence it audits. */
const EVIDENCE_AUDIT_KINDS: ReadonlyMap<AuditKind, ClaimEvidenceKind> = new Map([
  [AUDIT_KIND.TESTS, CLAIM_EVIDENCE_KIND.TEST],
  [AUDIT_KIND.EVAL_EVIDENCE, CLAIM_EVIDENCE_KIND.EVAL],
]);

/** Units covering both evidence audit kinds, one of them twice, so a run audits tests and eval evidence at once. */
const MIXED_EVIDENCE_AUDIT_KINDS: readonly AuditKind[] = [AUDIT_KIND.TESTS, AUDIT_KIND.EVAL_EVIDENCE, AUDIT_KIND.TESTS];

const LINKED_EVIDENCE_KIND_SETS: readonly (readonly ClaimEvidenceKind[])[] = [
  [],
  [CLAIM_EVIDENCE_KIND.TEST],
  [CLAIM_EVIDENCE_KIND.EVAL],
  [CLAIM_EVIDENCE_KIND.TEST, CLAIM_EVIDENCE_KIND.EVAL],
];

/** One `evidence` entry per distinct required evidence kind the audit kinds cover, in first-covered order. */
function expectedEvidenceEntries(
  auditKinds: readonly AuditKind[],
  node: AuditClaimNode,
  identity: ExpectedIdentity,
): readonly ExpectedAuditClaimEntry[] {
  if (node.malleability !== NODE_STATUS_MALLEABILITY.IMPLEMENTATION) return [];
  const entries: ExpectedAuditClaimEntry[] = [];
  for (const auditKind of auditKinds) {
    const evidenceKind = EVIDENCE_AUDIT_KINDS.get(auditKind);
    if (evidenceKind === undefined || !node.linkedEvidenceKinds.includes(evidenceKind)) continue;
    if (entries.some((entry) => entry.key === evidenceKind)) continue;
    entries.push({ section: AUDIT_CLAIM_ENTRY_SECTION.EVIDENCE, key: evidenceKind, ...identity });
  }
  return entries;
}

/**
 * Every combination of audit kind, node malleability, linked evidence kinds, and sealed terminal
 * status beside the entries the claim records for it, verdict excluded, plus the runs auditing both
 * evidence kinds, the rule-slug runs, and the unsealed runs.
 */
export function auditClaimEntryMappingCases(): readonly AuditClaimEntryMappingCase[] {
  const unit = sampleVerifyTestValue(arbitraryAuditScopeUnit());
  const verifier: VerifyVerifier = sampleVerifyTestValue(
    fc.record({
      kind: fc.constantFrom(...Object.values(VERIFY_VERIFIER_KIND)),
      id: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
  );
  const runId = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
  const ruleSlug = sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
  const cases: AuditClaimEntryMappingCase[] = [];
  for (const terminalStatus of SEALED_TERMINAL_STATUSES) {
    const identity = { actor: verifier, run: runId };
    for (const node of nodesOverAllMalleabilities()) {
      cases.push({
        title: `a ${terminalStatus} run over rule slug on a ${node.malleability} node`,
        run: { runId, sealed: true, terminalStatus, verifier, auditScopeUnits: [unit], ruleSlug },
        node,
        expected: [{ section: AUDIT_CLAIM_ENTRY_SECTION.AUDIT, key: ruleSlug, ...identity }],
      });
      for (const auditKind of Object.values(AUDIT_KIND)) {
        cases.push({
          title: `a ${terminalStatus} ${auditKind} unit on a ${node.malleability} node linking [${
            node.linkedEvidenceKinds.join(", ")
          }]`,
          run: {
            runId,
            sealed: true,
            terminalStatus,
            verifier,
            auditScopeUnits: [{ ...unit, auditKind }],
          },
          node,
          expected: expectedEvidenceEntries([auditKind], node, identity),
        });
      }
      cases.push({
        title: `a ${terminalStatus} run auditing [${
          MIXED_EVIDENCE_AUDIT_KINDS.join(", ")
        }] on a ${node.malleability} node linking [${node.linkedEvidenceKinds.join(", ")}]`,
        run: {
          runId,
          sealed: true,
          terminalStatus,
          verifier,
          auditScopeUnits: MIXED_EVIDENCE_AUDIT_KINDS.map((auditKind) => ({ ...unit, auditKind })),
        },
        node,
        expected: expectedEvidenceEntries(MIXED_EVIDENCE_AUDIT_KINDS, node, identity),
      });
    }
  }
  for (const node of nodesOverAllMalleabilities()) {
    cases.push({
      title: `an unsealed run on a ${node.malleability} node`,
      run: { runId, sealed: false, verifier, auditScopeUnits: [unit], ruleSlug },
      node,
      expected: [],
    });
  }
  return cases;
}

function nodesOverAllMalleabilities(): readonly AuditClaimNode[] {
  return Object.values(NODE_STATUS_MALLEABILITY).flatMap((malleability) =>
    LINKED_EVIDENCE_KIND_SETS.map((linkedEvidenceKinds) => ({ malleability, linkedEvidenceKinds }))
  );
}
