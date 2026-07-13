import {
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree/config";

export const SPEC_CONTEXT_TARGET_FAILURE_KIND = {
  AMBIGUOUS_SEGMENT: "ambiguous-segment",
  ARTIFACT_PATH: "artifact-path",
  ROOT_ARTIFACT_PATH: "root-artifact-path",
  UNKNOWN_SEGMENT: "unknown-segment",
} as const;

export type SpecContextTargetFailureKind =
  (typeof SPEC_CONTEXT_TARGET_FAILURE_KIND)[keyof typeof SPEC_CONTEXT_TARGET_FAILURE_KIND];

export type SpecContextTargetFailure =
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT;
    readonly input: string;
    readonly segment: string;
    readonly candidates: readonly string[];
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH;
    readonly input: string;
    readonly ownerId: string;
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH;
    readonly input: string;
  }
  | {
    readonly kind: typeof SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT;
    readonly input: string;
    readonly segment: string;
  };

export type SpecContextTargetResolution =
  | { readonly ok: true; readonly node: SpecTreeNode }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

type SpecContextArtifactEntry = Extract<
  SpecTreeSourceEntry,
  {
    readonly type:
      | typeof SPEC_TREE_ENTRY_TYPE.PRODUCT
      | typeof SPEC_TREE_ENTRY_TYPE.NODE
      | typeof SPEC_TREE_ENTRY_TYPE.DECISION
      | typeof SPEC_TREE_ENTRY_TYPE.EVIDENCE;
  }
>;

const TARGET_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const SPEC_TREE_ROOT_SEGMENT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;

function trimTrailingSeparators(target: string): string {
  let end = target.length;
  while (end > 0 && target[end - 1] === TARGET_SEPARATOR) end -= 1;
  return target.slice(0, end);
}

function normalizeTarget(target: string): string {
  const withoutTrailingSeparators = trimTrailingSeparators(target);
  const rootPrefix = `${SPEC_TREE_ROOT_SEGMENT}${TARGET_SEPARATOR}`;
  return withoutTrailingSeparators.startsWith(rootPrefix)
    ? withoutTrailingSeparators.slice(rootPrefix.length)
    : withoutTrailingSeparators;
}

function rootedTarget(target: string): string {
  return `${SPEC_TREE_ROOT_SEGMENT}${TARGET_SEPARATOR}${target}`;
}

function nodeSegment(node: SpecTreeNode): string {
  return node.id.split(TARGET_SEPARATOR).at(-1) ?? node.id;
}

function isSpecContextArtifactEntry(entry: SpecTreeSourceEntry): entry is SpecContextArtifactEntry {
  switch (entry.type) {
    case SPEC_TREE_ENTRY_TYPE.PRODUCT:
    case SPEC_TREE_ENTRY_TYPE.NODE:
    case SPEC_TREE_ENTRY_TYPE.DECISION:
    case SPEC_TREE_ENTRY_TYPE.EVIDENCE:
      return true;
    case SPEC_TREE_ENTRY_TYPE.SUPERSEDED:
    case SPEC_TREE_ENTRY_TYPE.INVALID:
      return false;
  }
}

function artifactOwnerId(entry: SpecContextArtifactEntry): string | undefined {
  if (entry.type === SPEC_TREE_ENTRY_TYPE.NODE) return entry.id;
  if (entry.type === SPEC_TREE_ENTRY_TYPE.PRODUCT) return undefined;
  return entry.parentId;
}

function coordinationNoteOwnerId(snapshot: SpecTreeSnapshot, normalized: string): string | undefined {
  return snapshot.allNodes.find((node) =>
    SPEC_TREE_GRAMMAR.COORDINATION_NOTES.some((noteName) => `${node.id}${TARGET_SEPARATOR}${noteName}` === normalized)
  )?.id;
}

function resolveArtifact(
  snapshot: SpecTreeSnapshot,
  input: string,
  normalized: string,
): SpecContextTargetFailure | undefined {
  const coordinationOwnerId = coordinationNoteOwnerId(snapshot, normalized);
  if (coordinationOwnerId !== undefined) {
    return {
      input,
      kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH,
      ownerId: coordinationOwnerId,
    };
  }
  const artifact = snapshot.entries
    .filter(isSpecContextArtifactEntry)
    .find((entry) => entry.ref?.path === rootedTarget(normalized));
  if (artifact === undefined) return undefined;
  const ownerId = artifactOwnerId(artifact);
  return ownerId === undefined
    ? { input, kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ROOT_ARTIFACT_PATH }
    : { input, kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.ARTIFACT_PATH, ownerId };
}

/** Resolves a user-supplied context target against node identities in a parsed snapshot. */
export function resolveSpecContextTarget(
  snapshot: SpecTreeSnapshot,
  input: string,
): SpecContextTargetResolution {
  const normalized = normalizeTarget(input);
  const artifactFailure = resolveArtifact(snapshot, input, normalized);
  if (artifactFailure !== undefined) return { failure: artifactFailure, ok: false };

  const segments = normalized.split(TARGET_SEPARATOR);
  let parentId: string | undefined;
  let resolved: SpecTreeNode | undefined;
  for (const segment of segments) {
    if (segment.length === 0) {
      return {
        failure: { input, kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT, segment },
        ok: false,
      };
    }
    const siblings = snapshot.allNodes.filter((node) => node.parentId === parentId);
    const exact = siblings.find((node) => nodeSegment(node) === segment);
    if (exact !== undefined) {
      resolved = exact;
      parentId = exact.id;
      continue;
    }
    const candidates = siblings.filter((node) => nodeSegment(node).startsWith(segment));
    if (candidates.length === 0) {
      return {
        failure: { input, kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT, segment },
        ok: false,
      };
    }
    if (candidates.length > 1) {
      return {
        failure: {
          candidates: candidates.map(nodeSegment).sort((left, right) => left.localeCompare(right)),
          input,
          kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.AMBIGUOUS_SEGMENT,
          segment,
        },
        ok: false,
      };
    }
    [resolved] = candidates;
    parentId = resolved.id;
  }
  if (resolved === undefined) {
    return {
      failure: { input, kind: SPEC_CONTEXT_TARGET_FAILURE_KIND.UNKNOWN_SEGMENT, segment: normalized },
      ok: false,
    };
  }
  return { node: resolved, ok: true };
}
