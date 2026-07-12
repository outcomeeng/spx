const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES = {
  ABBREVIATED: "abbreviated",
  AMBIGUOUS: "ambiguous",
  ARTIFACT: "artifact",
  CANONICAL: "canonical",
  ROOTED: "rooted",
  ROOT_ARTIFACT: "root-artifact",
  TRAILING_SEPARATOR: "trailing-separator",
  UNKNOWN: "unknown",
} as const;

export type SpecContextTargetMappingCaseKind =
  (typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES];

export type SpecContextTargetMappingCase = {
  readonly kind: SpecContextTargetMappingCaseKind;
  readonly title: string;
};

export const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND = SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES;

export function specContextTargetMappingCases(): readonly SpecContextTargetMappingCase[] {
  return [
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.CANONICAL,
      title: "maps a canonical node path to its canonical target",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOTED,
      title: "maps a node path with a leading spx root to its canonical target",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.TRAILING_SEPARATOR,
      title: "maps a node path with a trailing separator to its canonical target",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ABBREVIATED,
      title: "maps unique abbreviated node segments to their canonical target",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.UNKNOWN,
      title: "maps an unknown segment to an unresolved-input diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.AMBIGUOUS,
      title: "maps an ambiguous segment to a candidate diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps an artifact path to an owning-node diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ROOT_ARTIFACT,
      title: "maps a product-root decision path to node-selection guidance",
    },
  ];
}
