import { SPEC_CONTEXT_TARGET_FAILURE_KIND, type SpecContextTargetFailureKind } from "@/lib/spec-tree";

export const SPEC_CONTEXT_TARGET_DIAGNOSTIC_PREFIX = {
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS]: "Ambiguous spec context target",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.UNSUPPORTED_ARTIFACT]: "Unsupported spec context artifact",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.OUTSIDE_PRODUCT]: "Spec context target is outside the product",
  [SPEC_CONTEXT_TARGET_FAILURE_KIND.UNRESOLVED]: "Unresolved spec context target",
} as const satisfies Record<SpecContextTargetFailureKind, string>;
