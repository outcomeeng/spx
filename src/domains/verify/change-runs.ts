import type { JournalEvent } from "@/lib/agent-run-journal";

import {
  changeIdentityOf,
  headCommitOf,
  parseChangesetScope,
  projectVerifyRun,
  type RecordedInput,
  runJudgedPathsOf,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyDriveMode,
  type VerifyFindingCounts,
  type VerifyVerificationType,
} from "@/domains/verify/verify";

/**
 * The scope fields only a run's recorded-input sidecar carries: the scope type and scope identity
 * the run was started with, and the head commit of a changeset scope. A run without a sidecar
 * carries none of them.
 */
export interface VerifyChangeRunRecordedScope {
  readonly scopeType?: string;
  readonly scope?: string;
  readonly headCommit?: string;
}

/**
 * One verification run in a Change's listing: the drive mode, sealed state, terminal status, and
 * finding counts folded from the run's event history, and — when the run has a recorded-input
 * sidecar, the only record that carries them — the scope type and scope identity the run was
 * started with and the head commit of a changeset scope. A listed run never carries its finding
 * payloads.
 */
export interface VerifyChangeRun extends VerifyChangeRunRecordedScope {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
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

/** The scope fields a listed run carries from its recorded input; a run without one carries none. */
function recordedScopeOf(recordedInput: RecordedInput | undefined): VerifyChangeRunRecordedScope {
  if (recordedInput === undefined) return {};
  const headCommit = changesetHeadOf(recordedInput);
  return {
    scopeType: recordedInput.scopeType,
    scope: recordedInput.scopeIdentity,
    ...(headCommit === undefined ? {} : { headCommit }),
  };
}

/**
 * Project one run into its listing entry: the drive mode, sealed state, terminal status, and
 * finding counts from the terminal projection of its event history — the same fold `status`
 * reports — and the scope selectors from the input recorded at start when the run has one.
 */
export function projectChangeRun(args: {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly recordedInput: RecordedInput | undefined;
  readonly events: readonly JournalEvent[];
}): VerifyChangeRun {
  const projection = projectVerifyRun(args.events);
  return {
    runToken: args.runToken,
    verificationType: args.verificationType,
    ...recordedScopeOf(args.recordedInput),
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

/** How a path both compared runs judged relates across their head commits. */
export const VERIFY_RUN_COMPARISON_STATUS = {
  /** The path's blob at the first run's head commit differs from its blob at the second's. */
  CHANGED: "changed",
  /** The path is the same blob at both runs' head commits. */
  UNCHANGED: "unchanged",
} as const;

export type VerifyRunComparisonStatus =
  (typeof VERIFY_RUN_COMPARISON_STATUS)[keyof typeof VERIFY_RUN_COMPARISON_STATUS];

/** Why two runs of a Change cannot be compared. */
export const VERIFY_RUN_COMPARISON_REFUSAL = {
  /** The run records no head commit, so no path it judged has a content identity. */
  HEAD_COMMIT_ABSENT: "head-commit-absent",
  /** A path both runs judged is not a file at one run's head commit, so it has no blob there. */
  BLOB_ABSENT: "blob-absent",
} as const;

export type VerifyRunComparisonRefusal =
  (typeof VERIFY_RUN_COMPARISON_REFUSAL)[keyof typeof VERIFY_RUN_COMPARISON_REFUSAL];

/** One run's side of a comparison: its identity, the head commit it judged, and the paths it judged. */
export interface VerifyComparedRun {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly headCommit: string;
  readonly judgedPaths: readonly string[];
}

/** A path both runs judged, with whether its content changed between their head commits. */
export interface VerifyRunComparisonPath {
  readonly path: string;
  readonly status: VerifyRunComparisonStatus;
}

/** The comparison reported for two runs of one Change. */
export interface VerifyRunComparisonReport {
  readonly change: string;
  readonly first: Omit<VerifyComparedRun, "judgedPaths">;
  readonly second: Omit<VerifyComparedRun, "judgedPaths">;
  readonly paths: readonly VerifyRunComparisonPath[];
}

/** A refused comparison: the refusal class, and the run token or path it names. */
export interface VerifyRunComparisonRejection {
  readonly refusal: VerifyRunComparisonRefusal;
  readonly subject: string;
}

export type VerifyComparedRunResult =
  | { readonly ok: true; readonly value: VerifyComparedRun }
  | { readonly ok: false; readonly rejection: VerifyRunComparisonRejection };

export type VerifyRunComparisonResult =
  | { readonly ok: true; readonly value: VerifyRunComparisonReport }
  | { readonly ok: false; readonly rejection: VerifyRunComparisonRejection };

/**
 * One run's side of a comparison folded from its event history: the head commit its run-context
 * event records and every path its scope evidence judged. A run that records no head commit cannot
 * give a judged path a content identity and is refused naming its run token.
 */
export function comparedRunOf(args: {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly events: readonly JournalEvent[];
}): VerifyComparedRunResult {
  const headCommit = headCommitOf(args.events);
  if (headCommit === undefined) {
    return {
      ok: false,
      rejection: { refusal: VERIFY_RUN_COMPARISON_REFUSAL.HEAD_COMMIT_ABSENT, subject: args.runToken },
    };
  }
  return {
    ok: true,
    value: {
      runToken: args.runToken,
      verificationType: args.verificationType,
      headCommit,
      judgedPaths: runJudgedPathsOf(args.events),
    },
  };
}

/**
 * The paths both runs judged, in the order the first run judged them. A path only one run judged
 * has no counterpart to compare and is left out.
 */
export function commonJudgedPaths(first: VerifyComparedRun, second: VerifyComparedRun): readonly string[] {
  const secondPaths = new Set(second.judgedPaths);
  return first.judgedPaths.filter((path) => secondPaths.has(path));
}

/** A compared run's identity and head commit, without the judged paths the report lists jointly. */
function comparedRunIdentity(run: VerifyComparedRun): Omit<VerifyComparedRun, "judgedPaths"> {
  return { runToken: run.runToken, verificationType: run.verificationType, headCommit: run.headCommit };
}

/**
 * Compare two runs of one Change by the content of the files both judged: each path both runs
 * judged is `changed` when its blob at the first run's head commit differs from its blob at the
 * second run's head commit and `unchanged` when they are the same blob. `firstBlobs` and
 * `secondBlobs` hold each common path's blob object name at the respective head commit; a common
 * path missing from either is not a file there and refuses the comparison naming the path.
 */
export function compareChangeRuns(args: {
  readonly change: string;
  readonly first: VerifyComparedRun;
  readonly second: VerifyComparedRun;
  readonly firstBlobs: ReadonlyMap<string, string>;
  readonly secondBlobs: ReadonlyMap<string, string>;
}): VerifyRunComparisonResult {
  const paths: VerifyRunComparisonPath[] = [];
  for (const path of commonJudgedPaths(args.first, args.second)) {
    const firstBlob = args.firstBlobs.get(path);
    const secondBlob = args.secondBlobs.get(path);
    if (firstBlob === undefined || secondBlob === undefined) {
      return { ok: false, rejection: { refusal: VERIFY_RUN_COMPARISON_REFUSAL.BLOB_ABSENT, subject: path } };
    }
    paths.push({
      path,
      status: firstBlob === secondBlob ? VERIFY_RUN_COMPARISON_STATUS.UNCHANGED : VERIFY_RUN_COMPARISON_STATUS.CHANGED,
    });
  }
  return {
    ok: true,
    value: {
      change: args.change,
      first: comparedRunIdentity(args.first),
      second: comparedRunIdentity(args.second),
      paths,
    },
  };
}
