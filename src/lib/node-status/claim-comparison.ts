import { compareAsciiStrings } from "@/lib/state-store";

import {
  NODE_STATUS_CLAIM_FIELD,
  type NodeStatusClaim,
  type NodeStatusClaimEntry,
  type NodeStatusClaimResult,
  nodeStatusClaimResults,
  type NodeStatusClaimSection,
} from "./claim";

/** The kinds of difference a committed claim can show against its regeneration. */
export const NODE_STATUS_CLAIM_DIFFERENCE = {
  STATE: "state",
  ENTRY: "entry",
} as const;

export type NodeStatusClaimDifferenceKind =
  (typeof NODE_STATUS_CLAIM_DIFFERENCE)[keyof typeof NODE_STATUS_CLAIM_DIFFERENCE];

/** One difference: a node whose state differs, or the entry (section and key) whose verdict or read set differs. */
export interface NodeStatusClaimDifference {
  readonly nodeId: string;
  readonly kind: NodeStatusClaimDifferenceKind;
  readonly section?: NodeStatusClaimSection;
  readonly key?: string;
}

/**
 * Compare the committed claims with the regenerated ones. A node's state and an entry's verdict and read set
 * count; a pin commit, an actor and a run never do. A node or an entry present on one side only differs.
 */
export function compareNodeStatusClaims(
  committed: ReadonlyMap<string, NodeStatusClaim>,
  regenerated: ReadonlyMap<string, NodeStatusClaim>,
): readonly NodeStatusClaimDifference[] {
  const differences: NodeStatusClaimDifference[] = [];
  for (const nodeId of new Set([...committed.keys(), ...regenerated.keys()])) {
    const before = committed.get(nodeId);
    const after = regenerated.get(nodeId);
    if (before?.[NODE_STATUS_CLAIM_FIELD.STATE] !== after?.[NODE_STATUS_CLAIM_FIELD.STATE]) {
      differences.push({ nodeId, kind: NODE_STATUS_CLAIM_DIFFERENCE.STATE });
    }
    const entries = new Map<string, { section: NodeStatusClaimSection; key: string }>();
    const index = (claim: NodeStatusClaim | undefined) =>
      new Map(
        (claim === undefined ? [] : nodeStatusClaimResults(claim)).map((result) => [entryId(result), result]),
      );
    const beforeEntries = index(before);
    const afterEntries = index(after);
    for (const [id, result] of [...beforeEntries, ...afterEntries]) entries.set(id, result);
    for (const [id, { section, key }] of entries) {
      if (!sameResult(beforeEntries.get(id)?.entry, afterEntries.get(id)?.entry)) {
        differences.push({ nodeId, kind: NODE_STATUS_CLAIM_DIFFERENCE.ENTRY, section, key });
      }
    }
  }
  return differences.sort(compareDifferences);
}

function entryId({ section, key }: NodeStatusClaimResult): string {
  return JSON.stringify([section, key]);
}

function sameResult(left: NodeStatusClaimEntry | undefined, right: NodeStatusClaimEntry | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left[NODE_STATUS_CLAIM_FIELD.VERDICT] === right[NODE_STATUS_CLAIM_FIELD.VERDICT]
    && readSet(left).join("\0") === readSet(right).join("\0");
}

function readSet(entry: NodeStatusClaimEntry): readonly string[] {
  return [...new Set(entry[NODE_STATUS_CLAIM_FIELD.READ] ?? [])].sort(compareAsciiStrings);
}

function compareDifferences(left: NodeStatusClaimDifference, right: NodeStatusClaimDifference): number {
  return compareAsciiStrings(left.nodeId, right.nodeId)
    || compareAsciiStrings(left.kind, right.kind)
    || compareAsciiStrings(left.section ?? "", right.section ?? "")
    || compareAsciiStrings(left.key ?? "", right.key ?? "");
}
