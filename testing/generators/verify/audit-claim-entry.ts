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

const LINKED_EVIDENCE_KIND_SETS: readonly (readonly ClaimEvidenceKind[])[] = [
  [],
  [CLAIM_EVIDENCE_KIND.TEST],
  [CLAIM_EVIDENCE_KIND.EVAL],
  [CLAIM_EVIDENCE_KIND.TEST, CLAIM_EVIDENCE_KIND.EVAL],
];

function expectedEvidenceEntry(
  auditKind: AuditKind,
  node: AuditClaimNode,
  identity: ExpectedIdentity,
): readonly ExpectedAuditClaimEntry[] {
  const evidenceKind = EVIDENCE_AUDIT_KINDS.get(auditKind);
  if (evidenceKind === undefined) return [];
  if (node.malleability !== NODE_STATUS_MALLEABILITY.IMPLEMENTATION) return [];
  if (!node.linkedEvidenceKinds.includes(evidenceKind)) return [];
  return [{ section: AUDIT_CLAIM_ENTRY_SECTION.EVIDENCE, key: evidenceKind, ...identity }];
}

/**
 * Every combination of audit kind, node malleability, linked evidence kinds, and sealed terminal
 * status beside the entry the claim records for it, verdict excluded, plus the rule-slug runs and the unsealed runs.
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
          expected: expectedEvidenceEntry(auditKind, node, identity),
        });
      }
    }
  }
  for (const terminalStatus of SEALED_TERMINAL_STATUSES) {
    const identity = { actor: verifier, run: runId };
    for (const node of nodesOverAllMalleabilities()) {
      const auditKinds = [...EVIDENCE_AUDIT_KINDS.keys()];
      for (const orderedKinds of [auditKinds, [...auditKinds].reverse()]) {
        cases.push({
          title: `a ${terminalStatus} run scoping ${
            orderedKinds.join(" and ")
          } units on a ${node.malleability} node linking [${node.linkedEvidenceKinds.join(", ")}]`,
          run: {
            runId,
            sealed: true,
            terminalStatus,
            verifier,
            auditScopeUnits: orderedKinds.map((auditKind) => ({ ...unit, auditKind })),
          },
          node,
          expected: orderedKinds.flatMap((auditKind) => expectedEvidenceEntry(auditKind, node, identity)),
        });
      }
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
