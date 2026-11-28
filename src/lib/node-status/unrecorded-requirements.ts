import {
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_MALLEABILITY,
  type NodeStatusClaimVerification,
  type NodeStatusMalleability,
} from "./claim";
import type { NodeStatusResultFact } from "./claim-state";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "./classify";
import { NODE_STATUS_CURRENCY } from "./currency";

/** What a node's spec declares that decides which required results its claim can hold no entry for. */
export interface UnrecordedRequirementDeclaration {
  readonly malleability: NodeStatusMalleability;
  readonly holdsUnkeyedAuditReference: boolean;
}

/** The kinds of linked evidence whose Audit an implementation-malleable node requires, by the claim section of each. */
const AUDITED_EVIDENCE_SECTIONS = [NODE_STATUS_CLAIM_SECTION.TEST, NODE_STATUS_CLAIM_SECTION.EVAL] as const;

/** A required result the claim records no entry for: it never holds, so the node cannot derive `passing`. */
const UNRECORDED_RESULT: NodeStatusResultFact = {
  verdict: NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
  currency: NODE_STATUS_CURRENCY.CURRENT,
};

/**
 * One unrecorded result for each result the 4.0 rule requires of a node whose claim holds no entry for it: an audit
 * reference with no key at `verification` or `implementation` Malleability, whose result no entry can key, and, at
 * `implementation` Malleability, each kind of linked evidence, `test` or `eval`, whose `evidence` entry the claim
 * lacks.
 */
export function unrecordedRequirementResults(
  declaration: UnrecordedRequirementDeclaration,
  verification: NodeStatusClaimVerification,
): readonly NodeStatusResultFact[] {
  const unrecorded: NodeStatusResultFact[] = [];
  if (declaration.malleability !== NODE_STATUS_MALLEABILITY.SPEC && declaration.holdsUnkeyedAuditReference) {
    unrecorded.push(UNRECORDED_RESULT);
  }
  if (declaration.malleability !== NODE_STATUS_MALLEABILITY.IMPLEMENTATION) return unrecorded;
  for (const section of AUDITED_EVIDENCE_SECTIONS) {
    const linked = Object.keys(verification[section] ?? {}).length > 0;
    if (linked && verification[NODE_STATUS_CLAIM_SECTION.EVIDENCE]?.[section] === undefined) {
      unrecorded.push(UNRECORDED_RESULT);
    }
  }
  return unrecorded;
}
