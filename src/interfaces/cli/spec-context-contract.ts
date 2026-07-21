import { SPEC_CONTEXT_TARGET_FAILURE_KIND, type SpecContextTargetFailureKind } from "@/lib/spec-tree";

export const SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX = {
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT]: "Ambiguous spec context target segment",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH]: "Spec context target is an artifact path; use its owning node",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH]:
    "Spec context target is a product-root artifact; choose a node whose context includes it",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT]: "Unknown spec context target segment",
} as const satisfies Record<SpecContextTargetFailureKind, string>;
