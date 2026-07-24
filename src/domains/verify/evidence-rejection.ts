/**
 * Reasoned evidence-validator results.
 *
 * A validator answers with the accepted value or with the reason it refused: the payload field
 * path that was missing or malformed, or the structural requirement the payload did not meet.
 * A bare rejection collapses every malformed payload into one aggregate diagnostic, so a producer
 * cannot tell a missing identity field from an incompatible kind pairing or an out-of-order unit;
 * the validator already holds the exact check that failed, so surfacing it costs nothing and
 * removes a guess-and-retry loop from every producer.
 *
 * The reason is diagnostic text about the payload's shape. It names field paths and requirements
 * the product itself authored and never echoes a payload's own values, so a caller-supplied
 * string cannot travel into a reason and reach a consumer through it.
 *
 * @module domains/verify/evidence-rejection
 */

/** A validated evidence payload, or the reason validation refused it. */
export type EvidenceValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

const FIELD_REASON_PREFIX = "payload field ";
const FIELD_REASON_SUFFIX = " is missing or malformed";
const REQUIREMENT_REASON_PREFIX = "payload does not satisfy: ";
const FIELD_PATH_SEPARATOR = ".";
const FIELD_PATH_QUOTE = "\"";

/**
 * The structural requirements a payload can fail beyond a single field being missing or
 * malformed — relationships between fields, between a unit and the run's recorded evidence, or
 * between a payload and the run's own scope selector. Source-owned here so a validator and its
 * evidence name the same requirement.
 */
export const EVIDENCE_REQUIREMENT = {
  PAYLOAD_IS_OBJECT: "the payload is a JSON object",
  REVIEW_FINDING_ANCHOR: "a review finding anchors to a line or to a position",
  AUDIT_KIND_MATCHES_CLASS: "the audit kind is compatible with the audit class",
  AUDIT_COVERAGE_GAP_IS_UNCOVERED: "a coverage-gap unit carries an uncovered coverage status",
  AUDIT_COVERAGE_GAP_HAS_NO_PROVENANCE: "a coverage-gap unit records no producer provenance",
  AUDIT_PARENT_IS_NOT_SELF: "a unit's parent unit differs from the unit itself",
  AUDIT_FIRST_UNIT_IS_ROOT: "the run's first unit records no parent unit",
  AUDIT_FILE_ROOT_MATCHES_SCOPE:
    "a file-scoped run opens with a required root unit whose subject is the run's file selector",
  AUDIT_FILE_RUN_HAS_ONE_ROOT: "a file-scoped run records no second root unit",
  AUDIT_PARENT_IS_RECORDED: "a child unit names a parent unit already recorded in the run",
  AUDIT_FINDING_UNIT_IS_RECORDED: "a finding names a unit already recorded as scope evidence in the run",
} as const;

export type EvidenceRequirement = (typeof EVIDENCE_REQUIREMENT)[keyof typeof EVIDENCE_REQUIREMENT];

/** Accept a validated payload. */
export function acceptEvidence<T>(value: T): EvidenceValidationResult<T> {
  return { ok: true, value };
}

/**
 * Refuse a payload because one field is missing or malformed. Path segments compose the dotted
 * field path a producer reads in the payload it sent, so a nested validator names its own leaf
 * while its caller supplies the enclosing field.
 */
export function rejectEvidenceField(...path: readonly string[]): EvidenceValidationResult<never> {
  const fieldPath = `${FIELD_PATH_QUOTE}${path.join(FIELD_PATH_SEPARATOR)}${FIELD_PATH_QUOTE}`;
  return { ok: false, reason: `${FIELD_REASON_PREFIX}${fieldPath}${FIELD_REASON_SUFFIX}` };
}

/** Refuse a payload because it does not meet a structural requirement. */
export function rejectEvidenceRequirement(requirement: EvidenceRequirement): EvidenceValidationResult<never> {
  return { ok: false, reason: `${REQUIREMENT_REASON_PREFIX}${requirement}` };
}

/**
 * Carry a nested validator's rejection outward unchanged. The nested validator already composed
 * the full field path from the prefix its caller supplied, so re-wrapping would restate it.
 */
export function forwardEvidenceRejection<T>(
  rejection: Extract<EvidenceValidationResult<unknown>, { readonly ok: false }>,
): EvidenceValidationResult<T> {
  return rejection;
}
