import { SPEC_CONTEXT_TARGET_FAILURE_KIND, type SpecContextTargetFailure } from "@/domains/spec/context-target";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import { CONTROL_CHAR_UPPER_BOUND, DEL_CHAR_CODE, formatHexEscape } from "@/lib/sanitize-cli-argument";
import {
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_SUPERSEDED_NODE_SUFFIXES,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeNodeSourceEntry,
  type SpecTreeSnapshot,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import {
  DECISION_KINDS,
  type DecisionKind,
  KIND_REGISTRY,
  NODE_SUFFIXES,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree/config";
import {
  type RepresentativeSpecTreeFixture,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";

const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES = {
  ABBREVIATED: "abbreviated",
  AMBIGUOUS: "ambiguous",
  ARTIFACT: "artifact",
  CANONICAL: "canonical",
  EMPTY_SEGMENT: "empty-segment",
  INVALID_DIRECTORY: SPEC_TREE_ENTRY_TYPE.INVALID,
  ROOTED: "rooted",
  SUPERSEDED_DIRECTORY: SPEC_TREE_ENTRY_TYPE.SUPERSEDED,
  TRAILING_SEPARATOR: "trailing-separator",
  UNKNOWN: "unknown",
} as const;

const SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES = {
  EVAL_EVIDENCE: "eval-evidence",
  ISSUES: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[1],
  NODE_DECISION: "node-decision",
  NODE_SPEC: "node-spec",
  PLAN: SPEC_TREE_GRAMMAR.COORDINATION_NOTES[0],
  ROOT_DECISION: "root-decision",
  TEST_EVIDENCE: "test-evidence",
} as const;

const SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES = {
  EMPTY_TARGET: "empty-target",
  LEADING_SEPARATOR: "leading-separator",
  REPEATED_SEPARATOR: "repeated-separator",
} as const;

const SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY_VALUES = {
  REPRESENTATIVE: "representative",
  SINGLE_ROOT: "single-root",
} as const;

export type SpecContextTargetMappingCaseKind =
  (typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES)[keyof typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES];

type UnrecognizedNodeDirectoryCaseKind =
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.INVALID_DIRECTORY
  | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.SUPERSEDED_DIRECTORY;

export type SpecContextEmptySegmentPosition =
  (typeof SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES)[keyof typeof SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES];

export type SpecContextEmptySegmentTopology =
  (typeof SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY_VALUES)[keyof typeof SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY_VALUES];

export type SpecContextEmptySegmentMappingCase = {
  readonly kind: typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.EMPTY_SEGMENT;
  readonly position: SpecContextEmptySegmentPosition;
  readonly title: string;
  readonly topology: SpecContextEmptySegmentTopology;
};

type SpecContextNodeArtifactMappingCaseKind =
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.EVAL_EVIDENCE
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.ISSUES
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.NODE_SPEC
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.PLAN
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.TEST_EVIDENCE;

type SpecContextDecisionArtifactMappingCaseKind =
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.NODE_DECISION
  | typeof SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES.ROOT_DECISION;

export type SpecContextArtifactMappingCase =
  | {
    readonly artifactKind: SpecContextNodeArtifactMappingCaseKind;
    readonly kind: typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.ARTIFACT;
    readonly title: string;
  }
  | {
    readonly artifactKind: SpecContextDecisionArtifactMappingCaseKind;
    readonly decisionKind: DecisionKind;
    readonly kind: typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.ARTIFACT;
    readonly title: string;
  };

export type SpecContextTargetMappingCase =
  | {
    readonly kind: Exclude<
      SpecContextTargetMappingCaseKind,
      | UnrecognizedNodeDirectoryCaseKind
      | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.ARTIFACT
      | typeof SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES.EMPTY_SEGMENT
    >;
    readonly title: string;
  }
  | SpecContextArtifactMappingCase
  | SpecContextEmptySegmentMappingCase
  | {
    readonly kind: UnrecognizedNodeDirectoryCaseKind;
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
  readonly target: string;
};

export type SpecContextArtifactTargetFixture = {
  readonly failure: Extract<
    SpecContextTargetFailure,
    {
      readonly kind:
        | typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH
        | typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH;
    }
  >;
  readonly sourceFixture: RepresentativeSpecTreeFixture;
  readonly target: string;
};

export const SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND = SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND_VALUES;
export const SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND = SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND_VALUES;
export const SPEC_CONTEXT_EMPTY_SEGMENT_POSITION = SPEC_CONTEXT_EMPTY_SEGMENT_POSITION_VALUES;
export const SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY = SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY_VALUES;

function unregisteredNodeSuffix(seed: string): string {
  const registeredSuffixes = new Set([...NODE_SUFFIXES, ...SPEC_TREE_SUPERSEDED_NODE_SUFFIXES]);
  let candidate = `.${seed}`;
  while (registeredSuffixes.has(candidate)) candidate = `${candidate}-${seed}`;
  return candidate;
}

function supersededNodeSuffix(): string {
  return SPEC_TREE_SUPERSEDED_NODE_SUFFIXES[0];
}

function replaceFixtureEntry(
  entries: readonly SpecTreeSourceEntry[],
  replacement: SpecTreeSourceEntry,
): readonly SpecTreeSourceEntry[] {
  return entries.map((entry) => entry.id === replacement.id ? replacement : entry);
}

function sourceRef(path: string): { readonly id: string; readonly path: string } {
  return { id: path, path };
}

function nodeArtifactFixture(
  fixture: RepresentativeSpecTreeFixture,
  target: string,
): RepresentativeSpecTreeFixture {
  const root: SpecTreeNodeSourceEntry = { ...fixture.root, ref: sourceRef(target) };
  return { ...fixture, entries: replaceFixtureEntry(fixture.entries, root), root };
}

function decisionArtifactFixture(
  fixture: RepresentativeSpecTreeFixture,
  decisionKind: DecisionKind,
  parentId: string | undefined,
  target: string,
): RepresentativeSpecTreeFixture {
  const decision: SpecTreeDecisionSourceEntry = {
    ...fixture.decision,
    kind: decisionKind,
    parentId,
    ref: sourceRef(target),
  };
  return { ...fixture, decision, entries: replaceFixtureEntry(fixture.entries, decision) };
}

function evidenceArtifactFixture(
  fixture: RepresentativeSpecTreeFixture,
  target: string,
): RepresentativeSpecTreeFixture {
  const childEvidence: SpecTreeEvidenceSourceEntry = {
    ...fixture.childEvidence,
    parentId: fixture.root.id,
    ref: sourceRef(target),
    status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
  };
  return { ...fixture, childEvidence, entries: replaceFixtureEntry(fixture.entries, childEvidence) };
}

function ownedArtifactTargetFixture(
  fixture: RepresentativeSpecTreeFixture,
  sourceFixture: RepresentativeSpecTreeFixture,
  target: string,
): SpecContextArtifactTargetFixture {
  return {
    failure: {
      input: target,
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH,
      ownerId: fixture.root.id,
    },
    sourceFixture,
    target,
  };
}

function decisionArtifactMappingCases(
  artifactKind: SpecContextDecisionArtifactMappingCaseKind,
): readonly SpecContextArtifactMappingCase[] {
  return DECISION_KINDS.map((decisionKind) => ({
    artifactKind,
    decisionKind,
    kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
    title: artifactKind === SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.NODE_DECISION
      ? `maps a node-owned ${KIND_REGISTRY[decisionKind].label} path to its owning node`
      : `maps a product-root ${KIND_REGISTRY[decisionKind].label} path to node-selection guidance`,
  }));
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
  if (position === SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.EMPTY_TARGET) {
    return { segment: "", target: "" };
  }
  const target = snapshot.allNodes.find((node) => node.parentId !== undefined);
  if (target === undefined) throw new Error("Expected a representative spec-tree fixture with a nested node");
  const separator = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
  switch (position) {
    case SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.LEADING_SEPARATOR:
      return { segment: "", target: `${separator}${target.id}` };
    case SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.REPEATED_SEPARATOR: {
      const segments = target.id.split(separator);
      return {
        segment: "",
        target: [segments[0], "", ...segments.slice(1)].join(separator),
      };
    }
  }
}

export function specContextEmptySegmentSourceFixture(
  fixture: RepresentativeSpecTreeFixture,
  topology: SpecContextEmptySegmentTopology,
): RepresentativeSpecTreeFixture {
  switch (topology) {
    case SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.REPRESENTATIVE:
      return fixture;
    case SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.SINGLE_ROOT:
      return { ...fixture, entries: [fixture.product, fixture.root] };
  }
}

export function specContextUnrecognizedNodeDirectoryTarget(
  fixture: RepresentativeSpecTreeFixture,
  kind: UnrecognizedNodeDirectoryCaseKind,
): string {
  const suffix = kind === SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY
    ? unregisteredNodeSuffix(fixture.decision.slug)
    : supersededNodeSuffix();
  return `${fixture.root.order}-${fixture.root.slug}${suffix}`;
}

export function specContextArtifactTargetFixture(
  fixture: RepresentativeSpecTreeFixture,
  mappingCase: SpecContextArtifactMappingCase,
): SpecContextArtifactTargetFixture {
  const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);
  switch (mappingCase.artifactKind) {
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.NODE_SPEC: {
      const target = `spx/${rootDirectory}/${fixture.root.slug}.md`;
      return ownedArtifactTargetFixture(fixture, nodeArtifactFixture(fixture, target), target);
    }
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.NODE_DECISION: {
      const suffix = KIND_REGISTRY[mappingCase.decisionKind].suffix;
      const target = `spx/${fixture.root.id}/${fixture.decision.order}-${fixture.decision.slug}${suffix}`;
      return ownedArtifactTargetFixture(
        fixture,
        decisionArtifactFixture(fixture, mappingCase.decisionKind, fixture.root.id, target),
        target,
      );
    }
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.TEST_EVIDENCE: {
      const filename = [
        fixture.root.slug,
        SPEC_TREE_GRAMMAR.EVIDENCE.MODES[0],
        SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS[0],
        ...SPEC_TREE_GRAMMAR.EVIDENCE.TAILS.TYPESCRIPT,
      ].join(SPEC_TREE_GRAMMAR.EVIDENCE.SEGMENT_SEPARATOR);
      const target = `spx/${fixture.root.id}/${SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME}/${filename}`;
      return ownedArtifactTargetFixture(fixture, evidenceArtifactFixture(fixture, target), target);
    }
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.EVAL_EVIDENCE: {
      const target = `spx/${fixture.root.id}/${fixture.decision.slug}/${SPEC_TREE_GRAMMAR.EVAL_LANE[0]}`;
      return ownedArtifactTargetFixture(fixture, evidenceArtifactFixture(fixture, target), target);
    }
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.PLAN:
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.ISSUES: {
      const target = `spx/${fixture.root.id}/${mappingCase.artifactKind}`;
      return ownedArtifactTargetFixture(fixture, fixture, target);
    }
    case SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.ROOT_DECISION: {
      const suffix = KIND_REGISTRY[mappingCase.decisionKind].suffix;
      const target = `spx/${fixture.decision.order}-${fixture.decision.slug}${suffix}`;
      return {
        failure: {
          input: target,
          kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH,
        },
        sourceFixture: decisionArtifactFixture(fixture, mappingCase.decisionKind, undefined, target),
        target,
      };
    }
  }
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
      topology: SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.SINGLE_ROOT,
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT,
      position: SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.LEADING_SEPARATOR,
      title: "maps a leading separator to an empty-segment diagnostic",
      topology: SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.REPRESENTATIVE,
    },
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.EMPTY_SEGMENT,
      position: SPEC_CONTEXT_EMPTY_SEGMENT_POSITION.REPEATED_SEPARATOR,
      title: "maps repeated separators to an empty-segment diagnostic",
      topology: SPEC_CONTEXT_EMPTY_SEGMENT_TOPOLOGY.REPRESENTATIVE,
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
      artifactKind: SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.NODE_SPEC,
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps a node spec path to its owning node",
    },
    ...decisionArtifactMappingCases(SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.NODE_DECISION),
    {
      artifactKind: SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.TEST_EVIDENCE,
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps a co-located test evidence path to its owning node",
    },
    {
      artifactKind: SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.EVAL_EVIDENCE,
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps a co-located eval evidence path to its owning node",
    },
    {
      artifactKind: SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.PLAN,
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps a node-local plan path to its owning node",
    },
    {
      artifactKind: SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.ISSUES,
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.ARTIFACT,
      title: "maps a node-local issues path to its owning node",
    },
    ...decisionArtifactMappingCases(SPEC_CONTEXT_ARTIFACT_MAPPING_CASE_KIND.ROOT_DECISION),
    {
      kind: SPEC_CONTEXT_TARGET_MAPPING_CASE_KIND.INVALID_DIRECTORY,
      title: "maps an invalid node-directory path to an unresolved-input diagnostic",
    },
    {
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
