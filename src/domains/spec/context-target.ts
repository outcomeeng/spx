export const SPEC_CONTEXT_TARGET_FAILURE_KIND = {
  AMBIGUOUS_SEGMENT: "ambiguous-segment",
  ARTIFACT_PATH: "artifact-path",
  ROOT_ARTIFACT_PATH: "root-artifact-path",
  UNKNOWN_SEGMENT: "unknown-segment",
} as const;

export type SpecContextTargetFailureKind =
  (typeof SPEC_CONTEXT_TARGET_FAILURE_KIND)[keyof typeof SPEC_CONTEXT_TARGET_FAILURE_KIND];

export const SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX = {
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT]: "Ambiguous spec context target segment",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH]: "Spec context target is an artifact path; use its owning node",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH]:
    "Spec context target is a product-root artifact; choose a node whose context includes it",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT]: "Unknown spec context target segment",
} as const satisfies Record<SpecContextTargetFailureKind, string>;
