import type { Result } from "@/config/types";
import {
  VERIFY_CHANGE_KIND,
  VERIFY_EXPECTATIONS_FIELD,
  VERIFY_SCOPE_TYPE,
  type VerifyChangeInventoryEntry,
  type VerifyChangeKind,
  type VerifyExpectations,
} from "@/domains/verify/verify";
import { compareAsciiStrings } from "@/lib/state-store";

/** The inventory that holds a drifted change entry: the one recorded at start or the one the selector resolves to now. */
export const VERIFY_RECONCILIATION_INVENTORY = {
  RECORDED: "recorded",
  RESOLVED: "resolved",
} as const;

export type VerifyReconciliationInventory =
  (typeof VERIFY_RECONCILIATION_INVENTORY)[keyof typeof VERIFY_RECONCILIATION_INVENTORY];

/** The fields of the reconciliation result. */
export const VERIFY_RECONCILIATION_RESULT_FIELD = {
  UNACCOUNTED: "unaccounted",
  UNEXPECTED: "unexpected",
  DRIFTED: "drifted",
  RECONCILED: "reconciled",
} as const;

/** The fields of one drifted change entry. */
export const VERIFY_RECONCILIATION_DRIFT_FIELD = {
  PATH: "path",
  CHANGE_KIND: "changeKind",
  INVENTORY: "inventory",
} as const;

/** A change entry held by exactly one of the recorded and resolved inventories. */
export interface VerifyDriftedEntry {
  readonly path: string;
  readonly changeKind: VerifyChangeKind;
  readonly inventory: VerifyReconciliationInventory;
}

/** The structured result of reconciling a changeset run's judged scope against its inventories. */
export interface VerifyScopeReconciliation {
  /** Expected paths no judged file or judged deletion accounts for, in ordinal path order. */
  readonly unaccounted: readonly string[];
  /** Judged paths outside the expected entries, in ordinal path order. */
  readonly unexpected: readonly string[];
  /** Change entries in exactly one of the recorded and resolved inventories, in ordinal path order. */
  readonly drifted: readonly VerifyDriftedEntry[];
  /** True exactly when `unaccounted`, `unexpected`, and `drifted` are all empty. */
  readonly reconciled: boolean;
}

/** The four inputs a reconciliation result is a function of. */
export interface VerifyScopeReconciliationInput {
  readonly recordedInventory: readonly VerifyChangeInventoryEntry[];
  readonly expectations: VerifyExpectations | undefined;
  readonly judgedPaths: readonly string[];
  readonly judgedDeletions: readonly string[];
  readonly resolvedInventory: readonly VerifyChangeInventoryEntry[];
}

/** The reasons a run is refused reconciliation; each names the scope type, the missing inventory, or the selector. */
export const VERIFY_RECONCILIATION_REJECTION = {
  NOT_CHANGESET_SCOPED: "reconciliation reads only a changeset-scoped run, got scope type",
  NO_CHANGE_INVENTORY: "the run recorded no change inventory",
  SELECTOR_UNRESOLVED: "the changeset selector no longer resolves",
} as const;

const DRIFT_ENTRY_KEY_SEPARATOR = "\0";

function entryKey(entry: VerifyChangeInventoryEntry): string {
  return `${entry.path}${DRIFT_ENTRY_KEY_SEPARATOR}${entry.changeKind}`;
}

function sortedPaths(paths: Iterable<string>): string[] {
  return [...paths].sort(compareAsciiStrings);
}

function compareDriftedEntries(left: VerifyDriftedEntry, right: VerifyDriftedEntry): number {
  return compareAsciiStrings(left.path, right.path)
    || compareAsciiStrings(left.changeKind, right.changeKind)
    || compareAsciiStrings(left.inventory, right.inventory);
}

function driftedEntries(
  held: readonly VerifyChangeInventoryEntry[],
  other: readonly VerifyChangeInventoryEntry[],
  inventory: VerifyReconciliationInventory,
): VerifyDriftedEntry[] {
  const otherKeys = new Set(other.map(entryKey));
  const seen = new Set<string>();
  return held.flatMap((entry) => {
    const key = entryKey(entry);
    if (otherKeys.has(key) || seen.has(key)) return [];
    seen.add(key);
    return [{ path: entry.path, changeKind: entry.changeKind, inventory }];
  });
}

/**
 * Reject a run that cannot be reconciled: one that is not changeset-scoped, or one that recorded no
 * change inventory. The accepted value is the recorded inventory.
 */
export function checkReconcilableRun(
  scopeType: string,
  recordedInventory: readonly VerifyChangeInventoryEntry[] | undefined,
): Result<readonly VerifyChangeInventoryEntry[]> {
  if (scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) {
    return { ok: false, error: `${VERIFY_RECONCILIATION_REJECTION.NOT_CHANGESET_SCOPED} ${scopeType}` };
  }
  if (recordedInventory === undefined) {
    return { ok: false, error: VERIFY_RECONCILIATION_REJECTION.NO_CHANGE_INVENTORY };
  }
  return { ok: true, value: recordedInventory };
}

/** The reason a changeset selector that no longer resolves is refused, naming the selector. */
export function selectorUnresolvedReason(scopeIdentity: string): string {
  return `${VERIFY_RECONCILIATION_REJECTION.SELECTOR_UNRESOLVED}: ${scopeIdentity}`;
}

/**
 * Reconcile a changeset run's judged scope against its inventories. Expected entries are every
 * entry of the recorded change inventory plus each additional path the bound expectations declare.
 * An expected path the head holds is accounted for by a judged file, and an expected path the
 * inventory lists as deleted by a judged deletion. The result is a function of its four inputs
 * alone, and every list is in ordinal path order.
 */
export function reconcileScope(input: VerifyScopeReconciliationInput): VerifyScopeReconciliation {
  const additionalPaths = input.expectations?.[VERIFY_EXPECTATIONS_FIELD.ADDITIONAL_PATHS] ?? [];
  const deletedPaths = new Set(
    input.recordedInventory.filter((entry) => entry.changeKind === VERIFY_CHANGE_KIND.DELETED).map((entry) =>
      entry.path
    ),
  );
  const heldPaths = new Set([
    ...input.recordedInventory.filter((entry) => entry.changeKind !== VERIFY_CHANGE_KIND.DELETED).map((entry) =>
      entry.path
    ),
    ...additionalPaths,
  ]);
  const expectedPaths = new Set([...input.recordedInventory.map((entry) => entry.path), ...additionalPaths]);
  const judgedFiles = new Set(input.judgedPaths);
  const judgedDeletions = new Set(input.judgedDeletions);

  const unaccounted = [...expectedPaths].filter((path) =>
    (heldPaths.has(path) && !judgedFiles.has(path)) || (deletedPaths.has(path) && !judgedDeletions.has(path))
  );
  const unexpected = new Set([...judgedFiles, ...judgedDeletions].filter((path) => !expectedPaths.has(path)));
  const drifted = [
    ...driftedEntries(input.recordedInventory, input.resolvedInventory, VERIFY_RECONCILIATION_INVENTORY.RECORDED),
    ...driftedEntries(input.resolvedInventory, input.recordedInventory, VERIFY_RECONCILIATION_INVENTORY.RESOLVED),
  ].sort(compareDriftedEntries);

  const unaccountedSorted = sortedPaths(unaccounted);
  const unexpectedSorted = sortedPaths(unexpected);
  return {
    unaccounted: unaccountedSorted,
    unexpected: unexpectedSorted,
    drifted,
    reconciled: unaccountedSorted.length === 0 && unexpectedSorted.length === 0 && drifted.length === 0,
  };
}
