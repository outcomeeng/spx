import type { JournalEvent } from "@/lib/agent-run-journal";

import {
  changeIdentityOf,
  parseChangesetScope,
  projectVerifyRun,
  type RecordedInput,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyDriveMode,
  type VerifyFindingCounts,
  type VerifyVerificationType,
} from "@/domains/verify/verify";

/**
 * One verification run in a Change's listing: the selectors the run was started with, the head
 * commit of a changeset scope, and the drive mode, sealed state, terminal status, and finding
 * counts folded from the run's event history. A listed run never carries its finding payloads.
 */
export interface VerifyChangeRun {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly scopeType: string;
  readonly scope: string;
  readonly headCommit?: string;
  readonly driveMode: VerifyDriveMode;
  readonly sealed: boolean;
  readonly terminalStatus?: string;
  readonly findingCount: number;
  readonly findingCounts: VerifyFindingCounts;
}

/** A Change's listed runs keyed by every registered verification type, each holding that type's runs. */
export type VerifyChangeRunsByType = Readonly<Record<VerifyVerificationType, readonly VerifyChangeRun[]>>;

/** The listing reported for one Change. */
export interface VerifyChangeRunsReport {
  readonly change: string;
  readonly runs: VerifyChangeRunsByType;
}

/** The verification types a Change's listing groups runs under, in registry order. */
export const VERIFY_CHANGE_RUN_TYPES: readonly VerifyVerificationType[] = Object.values(VERIFY_VERIFICATION_TYPE);

/**
 * Whether a run serves the Change: its run-context event records exactly that Change identity. A
 * run started without a Change identity serves no Change.
 */
export function runServesChange(events: readonly JournalEvent[], change: string): boolean {
  return changeIdentityOf(events) === change;
}

/** The head of a changeset scope identity, or `undefined` for any other scope. */
function changesetHeadOf(recordedInput: RecordedInput): string | undefined {
  if (recordedInput.scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) return undefined;
  const changeset = parseChangesetScope(recordedInput.scopeIdentity);
  return changeset.ok ? changeset.value.head : undefined;
}

/**
 * Project one run into its listing entry: the selectors from the input recorded at start, and the
 * drive mode, sealed state, terminal status, and finding counts from the terminal projection of
 * its event history — the same fold `status` reports.
 */
export function projectChangeRun(args: {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly recordedInput: RecordedInput;
  readonly events: readonly JournalEvent[];
}): VerifyChangeRun {
  const projection = projectVerifyRun(args.events);
  const headCommit = changesetHeadOf(args.recordedInput);
  return {
    runToken: args.runToken,
    verificationType: args.verificationType,
    scopeType: args.recordedInput.scopeType,
    scope: args.recordedInput.scopeIdentity,
    ...(headCommit === undefined ? {} : { headCommit }),
    driveMode: projection.driveMode,
    sealed: projection.sealed,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    findingCount: projection.findingCount,
    findingCounts: projection.findingCounts,
  };
}

/** Group listed runs by verification type, keeping each type's runs in the order given. */
export function groupChangeRunsByType(runs: readonly VerifyChangeRun[]): VerifyChangeRunsByType {
  const groups: Partial<Record<VerifyVerificationType, readonly VerifyChangeRun[]>> = {};
  for (const verificationType of VERIFY_CHANGE_RUN_TYPES) {
    groups[verificationType] = runs.filter((run) => run.verificationType === verificationType);
  }
  return groups as VerifyChangeRunsByType;
}
