/**
 * Ownership classification vocabulary for the source graph: the classification
 * values, the evidence categories that justify them, and the one-to-one
 * classification-to-evidence mapping every consumer shares.
 *
 * @module outcomeeng/spec-tree/graph/source/kernel/classification
 */

/** Ownership classifications a source artifact maps to, ordered by decreasing ownership strength. */
export const SOURCE_OWNERSHIP_CLASSIFICATION = {
  OWNED_COVERED: "owned-covered",
  OWNED_REACHABLE: "owned-reachable",
  COVERED_UNOWNED: "covered-unowned",
  REACHABLE_UNOWNED: "reachable-unowned",
  UNOWNED: "unowned",
} as const;

export type SourceOwnershipClassification =
  (typeof SOURCE_OWNERSHIP_CLASSIFICATION)[keyof typeof SOURCE_OWNERSHIP_CLASSIFICATION];

/** Evidence categories that justify a classification. */
export const OWNERSHIP_EVIDENCE_CATEGORY = {
  LINKED_TEST_COVERAGE: "linked-test-coverage",
  LINKED_TEST_REACHABILITY: "linked-test-reachability",
  UNLINKED_COVERAGE: "unlinked-coverage",
  UNLINKED_REACHABILITY: "unlinked-reachability",
  NO_OWNERSHIP_EVIDENCE: "no-ownership-evidence",
} as const;

export type OwnershipEvidenceCategory = (typeof OWNERSHIP_EVIDENCE_CATEGORY)[keyof typeof OWNERSHIP_EVIDENCE_CATEGORY];

/** Each classification is justified by exactly one evidence category. */
export const CLASSIFICATION_EVIDENCE: Record<SourceOwnershipClassification, OwnershipEvidenceCategory> = {
  [SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_COVERED]: OWNERSHIP_EVIDENCE_CATEGORY.LINKED_TEST_COVERAGE,
  [SOURCE_OWNERSHIP_CLASSIFICATION.OWNED_REACHABLE]: OWNERSHIP_EVIDENCE_CATEGORY.LINKED_TEST_REACHABILITY,
  [SOURCE_OWNERSHIP_CLASSIFICATION.COVERED_UNOWNED]: OWNERSHIP_EVIDENCE_CATEGORY.UNLINKED_COVERAGE,
  [SOURCE_OWNERSHIP_CLASSIFICATION.REACHABLE_UNOWNED]: OWNERSHIP_EVIDENCE_CATEGORY.UNLINKED_REACHABILITY,
  [SOURCE_OWNERSHIP_CLASSIFICATION.UNOWNED]: OWNERSHIP_EVIDENCE_CATEGORY.NO_OWNERSHIP_EVIDENCE,
};
