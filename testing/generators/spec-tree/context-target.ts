import { SPEC_CONTEXT_TARGET_FAILURE_KIND, type SpecContextTargetFailure } from "@/domains/spec/context-target";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { CONTROL_CHAR_UPPER_BOUND, DEL_CHAR_CODE, formatHexEscape } from "@/lib/sanitize-cli-argument";
import { SPEC_TREE_ENTRY_TYPE, type SpecTreeNode, type SpecTreeSnapshot } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree/config";
import {
  orderedDirectoryName,
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES = {
  ABBREVIATED: "abbreviated",
  AMBIGUOUS: "ambiguous",
  ARTIFACT: "artifact",
  CANONICAL: "canonical",
  EMPTY_SEGMENT: "empty-segment",
  INVALID_DIRECTORY: SPEC_TREE_ENTRY_TYPE.INVALID,
  ISSUES_ARTIFACT: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[1],
  PLAN_ARTIFACT: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0],
  ROOTED: "rooted",
  ROOT_ARTIFACT: "root-artifact",
  SUPERSEDED_DIRECTORY: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
  TRAILING_SEPARATOR: "trailing-separator",
  UNKNOWN: "unknown",
} as const;

const SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES = {
  EMPTY_TARGET: "empty-target",
  LEADING_SEPARATOR: "leading-separator",
  REPEATED_SEPARATOR: "repeated-separator",
} as const;

export type SpecContextTargetMappingCaseKind =
  (typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES];

type UnrecognizedNodeDirectoryCaseKind =
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.INVALID_DIRECTORY
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.SUPERSEDED_DIRECTORY;

export type SpecContextEmptySegmentPosition =
  (typeof SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES)[keyof typeof SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES];

export type SpecContextCoordinationNoteName =
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.PLAN_ARTIFACT
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.ISSUES_ARTIFACT;

export type SpecContextTargetMappingCase =
  | {
    readonly kind: Exclude<
      SpecContextTargetMappingCaseKind,
      | UnrecognizedNodeDirectoryCaseKind
      | SpecContextCoordinationNoteName
      | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.EMPTY_SEGMENT
    >;
    readonly title: string;
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.EMPTY_SEGMENT;
    readonly position: SpecContextEmptySegmentPosition;
    readonly title: string;
  }
  | {
    readonly directoryName: string;
    readonly kind: UnrecognizedNodeDirectoryCaseKind;
    readonly title: string;
  }
  | {
    readonly kind: SpecContextCoordinationNoteName;
    readonly title: string;
  };

export type SpecContextTargetDiagnosticSafetyCase = {
  readonly failure: SpecContextTargetFailure;
  readonly title: string;
  readonly unsafeValue: string;
};

export type SpecContextAmbiguousTargetFixture = {
  readonly candidate: string;
  readonly prefix: string;
  readonly specPath: string;
};

export type SpecContextExactPrefixTargetFixture = {
  readonly candidateSpecPath: string;
  readonly target: string;
};

export type SpecContextEmptySegmentTargetFixture = {
  readonly segment: string;
  readonly snapshot: SpecTreeSnapshot;
  readonly target: string;
};

export const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND = SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES;
export const SPEC_CONTEXT_EMPTY_SEGMENT_POSITION = SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES;

function unrecognizedNodeDirectoryName(kind: UnrecognizedNodeDirectoryCaseKind): string {
  const suffix = sampleSpecTreeTestValue(
    kind === SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY
      ? SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY)
      : SPEC_TREE_TEST_GENERATOR.supersededNodeSuffix(),
  );
  return orderedDirectoryName(suffix);
}

function nodeSegment(nodeId: string): string {
  return nodeId.split(TRACKED_PATH_DIRECTORY_SEPARATOR).at(-1) ?? nodeId;
}

function shortestUniquePrefix(segment: string, siblingSegments: readonly string[]): string {
  for (let length = 1; length <= segment.length; length += 1) {
    const prefix = segment.slice(0, length);
    if (siblingSegments.filter((candidate) => candidate.startsWith(prefix)).length === 1) return prefix;
  }
  return segment;
}

function unsafeCliDiagnosticCodes(): readonly number[] {
  return [
    ...Array.from({ length: CONTROL_CHAR_UPPER_BOUND + 1 }, (_unused, code) => code),
    DEL_CHAR_CODE,
  ];
}

export function specContextLowerSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const orderPrefix = `${fixture.root.order}-`;
  return `${fixture.root.order - 1}-${rootDirectory.slice(orderPrefix.length)}`;
}

export function specContextSameIndexSiblingDirectoryName(fixture: RepresentativeSpecTreeFixture): string {
  const definition = KIND_REGISTRY[fixture.root.kind];
  return `${fixture.root.order}-${fixture.root.slug}-same${definition.suffix}`;
}

export function specContextAbbreviatedTarget(snapshot: SpecTreeSnapshot, target: SpecTreeNode): string {
  const byId = new Map(snapshot.allNodes.map((node) => [node.id, node]));
  const lineage: SpecTreeNode[] = [];
  let current: SpecTreeNode | undefined = target;
  while (current !== undefined) {
    lineage.unshift(current);
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }
  return lineage.map((node) => {
    const segment = nodeSegment(node.id);
    const siblings = snapshot.allNodes
      .filter((candidate) => candidate.parentId === node.parentId)
      .map((candidate) => nodeSegment(candidate.id));
    return shortestUniquePrefix(segment, siblings);
  }).join(TRACKED_PATH_DIRECTORY_SEPARATOR);
}

export function specContextAmbiguousTargetFixture(
  fixture: RepresentativeSpecTreeFixture,
): SpecContextAmbiguousTargetFixture {
  const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const suffix = KIND_REGISTRY[fixture.root.kind].suffix;
  const stem = target.slice(0, -suffix.length);
  const candidateSlug = `${fixture.root.slug}-candidate`;
  return {
    candidate: `${fixture.root.order}-${candidateSlug}${suffix}`,
    prefix: stem,
    specPath: `spx/${fixture.root.order}-${candidateSlug}${suffix}/${candidateSlug}.md`,
  };
}

export function specContextExactPrefixTargetFixture(
  fixture: RepresentativeSpecTreeFixture,
): SpecContextExactPrefixTargetFixture {
  const target = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  const suffix = KIND_REGISTRY[fixture.root.kind].suffix;
  const candidateSlug = `${fixture.root.slug}${suffix}-candidate`;
  return {
    candidateSpecPath: `spx/${fixture.root.order}-${candidateSlug}${suffix}/${candidateSlug}.md`,
    target,
  };
}

export function specContextNestedAmbiguousTarget(
  snapshot: SpecTreeSnapshot,
  ambiguity: SpecContextAmbiguousTargetFixture,
): string {
  const child = snapshot.allNodes.find((node) => node.parentId !== undefined) ?? snapshot.allNodes[0];
  const childSegment = nodeSegment(child.id);
  const siblingSegments = snapshot.allNodes
    .filter((candidate) => candidate.parentId === child.parentId)
    .map((candidate) => nodeSegment(candidate.id));
  return `${ambiguity.prefix}/${shortestUniquePrefix(childSegment, siblingSegments)}`;
}

export function specContextEmptySegmentTargetFixture(
  snapshot: SpecTreeSnapshot,
  position: SpecContextEmptySegmentPosition,
): SpecContextEmptySegmentTargetFixture {
  const target = snapshot.allNodes.find((node) => node.parentId !== undefined);
  if (target === undefined) throw new Error("Expected a representative spec-tree fixture with a nested node");
  const separator = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
  switch (position) {
    case SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.EMPTY_TARGET: {
      const root = snapshot.allNodes.find((node) => node.parentId === undefined);
      if (root === undefined) throw new Error("Expected a representative spec-tree fixture with a root node");
      return {
        segment: "",
        snapshot: { ...snapshot, allNodes: [root], nodes: [root] },
        target: "",
      };
    }
    case SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.LEADING_SEPARATOR:
      return { segment: "", snapshot, target: `${separator}${target.id}` };
    case SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.REPEATED_SEPARATOR: {
      const segments = target.id.split(separator);
      return {
        segment: "",
        snapshot,
        target: [segments[0], "", ...segments.slice(1)].join(separator),
      };
    }
  }
}

export function specContextCoordinationNoteTarget(
  target: SpecTreeNode,
  noteName: SpecContextCoordinationNoteName,
): string {
  return `spx/${target.id}/${noteName}`;
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
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT,
      position: SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.EMPTY_TARGET,
      title: "maps an empty target to an empty-segment diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT,
      position: SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.LEADING_SEPARATOR,
      title: "maps a leading separator to an empty-segment diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT,
      position: SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.REPEATED_SEPARATOR,
      title: "maps repeated separators to an empty-segment diagnostic",
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
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.PLAN_ARTIFACT,
      title: "maps a node-local plan path to an owning-node diagnostic",
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ISSUES_ARTIFACT,
      title: "maps a node-local issues path to an owning-node diagnostic",
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

export function specContextTargetDiagnosticSafetyCases(): readonly SpecContextTargetDiagnosticSafetyCase[] {
  return unsafeCliDiagnosticCodes().flatMap((code) => {
    const escape = formatHexEscape(code);
    const unsafeValue = String.fromCodePoint(code);
    return [
      {
        failure: {
          input: unsafeValue,
          kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH,
          ownerId: unsafeValue,
        },
        title: `escapes ${escape} in artifact diagnostics`,
        unsafeValue,
      },
      {
        failure: {
          candidates: [unsafeValue],
          input: unsafeValue,
          kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT,
          segment: unsafeValue,
        },
        title: `escapes ${escape} in ambiguous diagnostics`,
        unsafeValue,
      },
    ];
  });
}
