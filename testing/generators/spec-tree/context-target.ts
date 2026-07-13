import { SPEC_TREE_ENTRY_TYPE } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  orderedDirectoryName,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES = {
  ABBREVIATED: "abbreviated",
  AMBIGUOUS: "ambiguous",
  ARTIFACT: "artifact",
  CANONICAL: "canonical",
  INVALID_DIRECTORY: SPEC_TREE_ENTRY_TYPE.INVALID,
  ROOTED: "rooted",
  ROOT_ARTIFACT: "root-artifact",
  SUPERSEDED_DIRECTORY: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
  TRAILING_SEPARATOR: "trailing-separator",
  UNKNOWN: "unknown",
} as const;

export type SpecContextTargetMappingCaseKind =
  (typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES];

type UnrecognizedNodeDirectoryCaseKind =
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.INVALID_DIRECTORY
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.SUPERSEDED_DIRECTORY;

export type SpecContextTargetMappingCase =
  | {
    readonly kind: Exclude<SpecContextTargetMappingCaseKind, UnrecognizedNodeDirectoryCaseKind>;
    readonly title: string;
  }
  | {
    readonly directoryName: string;
    readonly kind: UnrecognizedNodeDirectoryCaseKind;
    readonly title: string;
  };

export const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND = SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES;

function unrecognizedNodeDirectoryName(kind: UnrecognizedNodeDirectoryCaseKind): string {
  const suffix = sampleSpecTreeTestValue(
    kind === SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY
      ? SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY)
      : SPEC_TREE_TEST_GENERATOR.supersededNodeSuffix(),
  );
  return orderedDirectoryName(suffix);
}

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
    {
      directoryName: unrecognizedNodeDirectoryName(SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY),
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY,
      title: "maps an invalid node-directory path to an unresolved-input diagnostic",
    },
    {
      directoryName: unrecognizedNodeDirectoryName(SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY),
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.SUPERSEDED_DIRECTORY,
      title: "maps a superseded node-directory path to an unresolved-input diagnostic",
    },
  ];
}
