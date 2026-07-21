import type { FindingIdentityFields } from "@/domains/verify/run-set";
import {
  type ReviewFinding,
  type ReviewScopeUnit,
  validateReviewFinding,
  validateReviewScope,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";

/** Review defines no rule vocabulary; the identity record's rule component is this review-owned constant. */
export const REVIEW_FINDING_IDENTITY_RULE = "";

/**
 * The normalized subject of a review anchor: the side and path name where a defect lives across
 * commits, while line, position, and provider anchors move with each re-publication.
 */
function reviewAnchorSubject(side: string, path: string): string {
  return JSON.stringify([side, path]);
}

/** Map a validated review finding to its run-set identity fields. */
export function reviewFindingIdentityFields(finding: ReviewFinding): FindingIdentityFields {
  return {
    verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
    normalizedSubject: reviewAnchorSubject(finding.side, finding.path),
    rule: REVIEW_FINDING_IDENTITY_RULE,
    fingerprint: finding.finding.summary,
  };
}

/** Map a validated reviewed unit to its run-set coverage key. */
export function reviewScopeUnitKey(unit: ReviewScopeUnit): string {
  return reviewAnchorSubject(unit.side, unit.path);
}

function wholePayloadIdentity(payload: JsonValue): FindingIdentityFields {
  const canonical = JSON.stringify(payload);
  return {
    verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
    normalizedSubject: canonical,
    rule: REVIEW_FINDING_IDENTITY_RULE,
    fingerprint: canonical,
  };
}

/**
 * Total payload-shaped finding-identity adapter for the run-set projection: a validated review
 * finding maps through its schema fields; a non-conforming payload maps to its whole-payload
 * canonical identity instead of throwing.
 */
export function reviewRunSetFindingIdentity(payload: JsonValue): FindingIdentityFields {
  const finding = validateReviewFinding(payload);
  return finding === undefined ? wholePayloadIdentity(payload) : reviewFindingIdentityFields(finding);
}

/** Total payload-shaped reviewed-unit key adapter for the run-set projection. */
export function reviewRunSetScopeUnitKey(payload: JsonValue): string {
  const unit = validateReviewScope(payload);
  return unit === undefined ? JSON.stringify(payload) : reviewScopeUnitKey(unit);
}
