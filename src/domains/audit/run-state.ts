import type { Result } from "@/config/types";
import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { JournalEvent, JournalEventInput } from "@/lib/agent-run-journal";
import {
  compareAsciiStrings,
  formatRunTimestamp,
  type JsonRecord,
  resolveBranchIdentity,
  runFileName,
  slugBranchIdentity,
} from "@/lib/state-store";

export {
  formatRunTimestamp as formatAuditRunTimestamp,
  resolveBranchIdentity as resolveAuditBranchIdentity,
  slugBranchIdentity as slugAuditBranchIdentity,
};

export const AUDIT_RUN_STATE_STATUS = {
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
} as const;

export const AUDIT_RUN_STATE_DISPLAY = {
  [AUDIT_RUN_STATE_STATUS.APPROVED]: "APPROVED",
  [AUDIT_RUN_STATE_STATUS.REJECTED]: "REJECT",
  [AUDIT_RUN_STATE_STATUS.FAILED]: "FAILED",
  [AUDIT_RUN_STATE_STATUS.INTERRUPTED]: "INTERRUPTED",
} as const;

export const AUDIT_RUN_STATE_FIELDS = {
  BRANCH_NAME: "branchName",
  BRANCH_SLUG: "branchSlug",
  HEAD_SHA: "headSha",
  BASE_REF: "baseRef",
  AUDIT_CONFIG_DIGEST: "auditConfigDigest",
  AUDITORS: "auditors",
  TARGETS: "targets",
  STARTED_AT: "startedAt",
  COMPLETED_AT: "completedAt",
  VERDICT_PATH: "verdictPath",
  STATUS: "status",
} as const;

export const AUDIT_RUN_PROGRESS_FIELDS = {
  STEP: "step",
  MESSAGE: "message",
  AT: "at",
} as const;

export const AUDIT_PROGRESS_STEP = {
  CHANGESET_DETERMINED: "changeset-determined",
  DIFF_ANALYZED: "diff-analyzed",
  ADDITIONAL_FILE_INSPECTED: "additional-file-inspected",
  VERDICT_CREATED: "verdict-created",
  FILES_PASSED_FORMAT_CHECK: "files-passed-format-check",
  DONE: "done",
} as const;

export const AUDIT_RUN_STATE_INCOMPLETE_REASON = {
  MISSING_STATE: "missing-state",
  IO_ERROR: "io-error",
  SHAPE_INVALID_STATE: "shape-invalid-state",
} as const;

export const AUDIT_RUN_STATE_ERROR = {
  RUN_FILE_COLLISION_LIMIT: "audit run file collision limit exhausted",
  RUN_FILE_CREATE_FAILED: "audit run file create failed",
  INVALID_RUN_FILE_PATH: "audit run file must be a branch-scoped audit run file",
  MISSING_INIT_EVENT: "audit run has no init event",
  UNKNOWN_CLOSE_STATUS: "unknown audit close status",
  UNKNOWN_PROGRESS_STEP: "unknown audit progress step",
  INVALID_TERMINAL_STATE: "audit run state must be terminal",
  STATE_ALREADY_EXISTS: "audit run state already exists",
  STATE_WRITE_FAILED: "audit run state write failed",
} as const;

export type AuditRunStateStatus = (typeof AUDIT_RUN_STATE_STATUS)[keyof typeof AUDIT_RUN_STATE_STATUS];
export type AuditProgressStep = (typeof AUDIT_PROGRESS_STEP)[keyof typeof AUDIT_PROGRESS_STEP];
export type AuditRunStateIncompleteReason =
  (typeof AUDIT_RUN_STATE_INCOMPLETE_REASON)[keyof typeof AUDIT_RUN_STATE_INCOMPLETE_REASON];

export interface AuditRunState {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly auditConfigDigest: string;
  readonly auditors: readonly string[];
  readonly targets: PathFilterConfig;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly verdictPath?: string;
  readonly status: AuditRunStateStatus;
}

export interface AuditRunStartedState {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly auditConfigDigest: string;
  readonly auditors: readonly string[];
  readonly targets: PathFilterConfig;
  readonly startedAt: string;
}

export interface AuditRunProgressState {
  readonly step: AuditProgressStep;
  readonly message?: string;
  readonly at: string;
}

export interface AuditTerminalRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly state: AuditRunState;
}

export interface AuditIncompleteRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly reason: AuditRunStateIncompleteReason;
  readonly error?: string;
}

export interface AuditBranchRuns {
  readonly terminalRuns: readonly AuditTerminalRun[];
  readonly incompleteRuns: readonly AuditIncompleteRun[];
}

export type AuditRunStateParseResult =
  | { readonly ok: true; readonly value: AuditRunState }
  | { readonly ok: false; readonly reason: AuditRunStateIncompleteReason; readonly error?: string };

function compareTerminalRuns(left: AuditTerminalRun, right: AuditTerminalRun): number {
  const completed = compareAsciiStrings(left.state.completedAt, right.state.completedAt);
  if (completed !== 0) return completed;
  const started = compareAsciiStrings(left.state.startedAt, right.state.startedAt);
  if (started !== 0) return started;
  return compareAsciiStrings(left.runFileName, right.runFileName);
}

export function selectLatestTerminalAuditRun(
  runs: readonly AuditTerminalRun[],
): AuditTerminalRun | undefined {
  return runs.reduce<AuditTerminalRun | undefined>((latest, candidate) => {
    if (latest === undefined) return candidate;
    return compareTerminalRuns(latest, candidate) < 0 ? candidate : latest;
  }, undefined);
}

export function auditRunFileName(runToken: string): string {
  return runFileName(runToken);
}

export function auditRunStateRecord(state: AuditRunState): JsonRecord {
  return {
    branchName: state.branchName,
    branchSlug: state.branchSlug,
    headSha: state.headSha,
    baseRef: state.baseRef,
    auditConfigDigest: state.auditConfigDigest,
    auditors: state.auditors,
    targets: pathFilterRecord(state.targets),
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    ...(state.verdictPath === undefined ? {} : { verdictPath: state.verdictPath }),
    status: state.status,
  };
}

export const AUDIT_RUN_EVENT = {
  SOURCE: "/spx/audit",
  STARTED_TYPE: "com.outcomeeng.spx.audit.run.started",
  PROGRESS_TYPE: "com.outcomeeng.spx.audit.run.progress",
  COMPLETED_TYPE: "com.outcomeeng.spx.audit.run.completed",
} as const;

export function auditRunStartedEventInput(
  state: AuditRunStartedState,
  meta: { readonly id: string; readonly time: string; readonly attempt: number },
): JournalEventInput {
  return {
    id: meta.id,
    source: AUDIT_RUN_EVENT.SOURCE,
    type: AUDIT_RUN_EVENT.STARTED_TYPE,
    time: meta.time,
    attempt: meta.attempt,
    data: {
      branchName: state.branchName,
      branchSlug: state.branchSlug,
      headSha: state.headSha,
      baseRef: state.baseRef,
      auditConfigDigest: state.auditConfigDigest,
      auditors: state.auditors,
      targets: pathFilterRecord(state.targets),
      startedAt: state.startedAt,
    },
  };
}

export function auditRunProgressEventInput(
  state: AuditRunProgressState,
  meta: { readonly id: string; readonly time: string; readonly attempt: number },
): JournalEventInput {
  return {
    id: meta.id,
    source: AUDIT_RUN_EVENT.SOURCE,
    type: AUDIT_RUN_EVENT.PROGRESS_TYPE,
    time: meta.time,
    attempt: meta.attempt,
    data: {
      step: state.step,
      ...(state.message === undefined ? {} : { message: state.message }),
      at: state.at,
    },
  };
}

export function isAuditProgressStep(value: string): value is AuditProgressStep {
  return Object.values(AUDIT_PROGRESS_STEP).includes(value as AuditProgressStep);
}

export function auditRunCompletedEventInput(
  state: AuditRunState,
  meta: { readonly id: string; readonly time: string; readonly attempt: number },
): JournalEventInput {
  return {
    id: meta.id,
    source: AUDIT_RUN_EVENT.SOURCE,
    type: AUDIT_RUN_EVENT.COMPLETED_TYPE,
    time: meta.time,
    attempt: meta.attempt,
    data: auditRunStateRecord(state),
  };
}

export function foldAuditRunState(events: readonly JournalEvent[]): AuditRunStateParseResult {
  let completed: JournalEvent | undefined;
  for (const event of events) {
    if (event.type === AUDIT_RUN_EVENT.COMPLETED_TYPE) completed = event;
  }
  if (completed === undefined) {
    return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE };
  }
  const validated = validateAuditRunState(completed.data);
  if (!validated.ok) {
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
      error: validated.error,
    };
  }
  return validated;
}

function validateAuditRunState(value: unknown): Result<AuditRunState> {
  if (!isRecord(value)) return { ok: false, error: "audit run state must be an object" };
  const branchName = readString(value, AUDIT_RUN_STATE_FIELDS.BRANCH_NAME);
  if (!branchName.ok) return branchName;
  const branchSlug = readString(value, AUDIT_RUN_STATE_FIELDS.BRANCH_SLUG);
  if (!branchSlug.ok) return branchSlug;
  const headSha = readString(value, AUDIT_RUN_STATE_FIELDS.HEAD_SHA);
  if (!headSha.ok) return headSha;
  const baseRef = readString(value, AUDIT_RUN_STATE_FIELDS.BASE_REF);
  if (!baseRef.ok) return baseRef;
  const auditConfigDigest = readString(value, AUDIT_RUN_STATE_FIELDS.AUDIT_CONFIG_DIGEST);
  if (!auditConfigDigest.ok) return auditConfigDigest;
  const auditors = readStringArray(value, AUDIT_RUN_STATE_FIELDS.AUDITORS);
  if (!auditors.ok) return auditors;
  const targets = readPathFilter(value, AUDIT_RUN_STATE_FIELDS.TARGETS);
  if (!targets.ok) return targets;
  const startedAt = readString(value, AUDIT_RUN_STATE_FIELDS.STARTED_AT);
  if (!startedAt.ok) return startedAt;
  const completedAt = readString(value, AUDIT_RUN_STATE_FIELDS.COMPLETED_AT);
  if (!completedAt.ok) return completedAt;
  const status = readStatus(value, AUDIT_RUN_STATE_FIELDS.STATUS);
  if (!status.ok) return status;
  const verdictPathRaw = value[AUDIT_RUN_STATE_FIELDS.VERDICT_PATH];
  if (verdictPathRaw !== undefined && typeof verdictPathRaw !== "string") {
    return { ok: false, error: `${AUDIT_RUN_STATE_FIELDS.VERDICT_PATH} must be a string` };
  }

  return {
    ok: true,
    value: {
      branchName: branchName.value,
      branchSlug: branchSlug.value,
      headSha: headSha.value,
      baseRef: baseRef.value,
      auditConfigDigest: auditConfigDigest.value,
      auditors: auditors.value,
      targets: targets.value,
      startedAt: startedAt.value,
      completedAt: completedAt.value,
      ...(verdictPathRaw === undefined ? {} : { verdictPath: verdictPathRaw }),
      status: status.value,
    },
  };
}

function readString(value: Record<string, unknown>, field: string): Result<string> {
  const raw = value[field];
  return typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a non-empty string` };
}

function readStringArray(value: Record<string, unknown>, field: string): Result<readonly string[]> {
  const raw = value[field];
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string" && entry.length > 0)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be an array of non-empty strings` };
}

function readPathFilter(value: Record<string, unknown>, field: string): Result<PathFilterConfig> {
  return validatePathFilterConfig(value[field], field);
}

function pathFilterRecord(filter: PathFilterConfig): JsonRecord {
  return {
    ...(filter.include === undefined ? {} : { [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: filter.include }),
    ...(filter.exclude === undefined ? {} : { [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: filter.exclude }),
  };
}

function readStatus(value: Record<string, unknown>, field: string): Result<AuditRunStateStatus> {
  const raw = value[field];
  return isAuditRunStateStatus(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a terminal audit status` };
}

export function isAuditRunStateStatus(value: unknown): value is AuditRunStateStatus {
  return typeof value === "string" && Object.values(AUDIT_RUN_STATE_STATUS).includes(value as AuditRunStateStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
