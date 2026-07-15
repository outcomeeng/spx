import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { Result } from "@/config/types";
import type { JournalEvent, JournalEventInput } from "@/lib/agent-run-journal";
import { RUNTIME_EVENT_NAMESPACE_DEFAULT } from "@/lib/agent-run-journal/config";
import type { JsonRecord } from "@/lib/state-store";

/** The terminal statuses a journal run folds to. */
export const JOURNAL_RUN_STATE_STATUS = {
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
  PASSED: "passed",
} as const;

/** The kinds of target a journal run is scoped to. */
export const JOURNAL_TARGET_KIND = {
  BRANCH: "branch",
  PULL_REQUEST: "pull-request",
} as const;

/** Why a run folds to incomplete rather than terminal evidence. */
export const JOURNAL_RUN_STATE_INCOMPLETE_REASON = {
  MISSING_STATE: "missing-state",
  UNSEALED: "unsealed",
  SHAPE_INVALID_STATE: "shape-invalid-state",
} as const;

export const JOURNAL_RUN_EVENT_TYPE_SUFFIX = {
  COMPLETED: ".journal.run.completed",
} as const;

/**
 * The generic, type-agnostic run-lifecycle event vocabulary. The verification
 * kind is the opaque `<type>` scope segment, never an event-type name, so this
 * vocabulary is identical for every kind.
 */
export const JOURNAL_RUN_EVENT = {
  SOURCE: "/spx/journal",
  STARTED_TYPE: `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.journal.run.started`,
  PROGRESS_TYPE: `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.journal.run.progress`,
  COMPLETED_TYPE: `${RUNTIME_EVENT_NAMESPACE_DEFAULT}${JOURNAL_RUN_EVENT_TYPE_SUFFIX.COMPLETED}`,
} as const;

export const JOURNAL_RUN_STATE_FIELDS = {
  BRANCH_NAME: "branchName",
  BRANCH_SLUG: "branchSlug",
  TARGET_KIND: "targetKind",
  PULL_REQUEST_NUMBER: "pullRequestNumber",
  HEAD_SHA: "headSha",
  BASE_REF: "baseRef",
  BASE_SHA: "baseSha",
  CONFIG_DIGEST: "configDigest",
  PARTICIPANTS: "participants",
  SCOPE: "scope",
  STARTED_AT: "startedAt",
  COMPLETED_AT: "completedAt",
  OUTPUT_PATHS: "outputPaths",
  STATUS: "status",
} as const;

export type JournalRunStateStatus = (typeof JOURNAL_RUN_STATE_STATUS)[keyof typeof JOURNAL_RUN_STATE_STATUS];
export type JournalTargetKind = (typeof JOURNAL_TARGET_KIND)[keyof typeof JOURNAL_TARGET_KIND];
export type JournalRunStateIncompleteReason =
  (typeof JOURNAL_RUN_STATE_INCOMPLETE_REASON)[keyof typeof JOURNAL_RUN_STATE_INCOMPLETE_REASON];

/** The run-scope identity fields a journal run state carries. */
interface JournalRunStateIdentity {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly targetKind: JournalTargetKind;
  readonly pullRequestNumber?: number;
  readonly headSha: string;
  readonly baseRef: string;
  readonly baseSha?: string;
}

/** The run-outcome body fields a journal run state carries. */
interface JournalRunStateBody {
  readonly configDigest: string;
  readonly participants: readonly string[];
  readonly scope: PathFilterConfig;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputPaths: readonly string[];
  readonly status: JournalRunStateStatus;
}

/**
 * The terminal projection of one journal run, folded from its event history.
 * The union covers both branch- and pull-request-scoped runs and every agentic
 * verification kind; `pullRequestNumber` and `baseSha` are present only when the
 * run carries them.
 */
export interface JournalRunState extends JournalRunStateIdentity, JournalRunStateBody {}

export type JournalRunStateParseResult =
  | { readonly ok: true; readonly value: JournalRunState }
  | {
    readonly ok: false;
    readonly reason: JournalRunStateIncompleteReason;
    readonly error?: string;
  };

/**
 * Fold a run's event history and seal state into its terminal projection. A run
 * is terminal evidence only when its journal is sealed and holds a
 * terminal-completion event; an unsealed run folds to incomplete whatever events
 * it holds, and a sealed run with no completion event folds to missing.
 */
export function foldJournalRunState(
  events: readonly JournalEvent[],
  sealed: boolean,
): JournalRunStateParseResult {
  if (!sealed) {
    return { ok: false, reason: JOURNAL_RUN_STATE_INCOMPLETE_REASON.UNSEALED };
  }
  let completed: JournalEvent | undefined;
  for (const event of events) {
    if (isJournalRunCompletedEventType(event.type)) completed = event;
  }
  if (completed === undefined) {
    return {
      ok: false,
      reason: JOURNAL_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
    };
  }
  const validated = validateJournalRunState(completed.data);
  if (!validated.ok) {
    return {
      ok: false,
      reason: JOURNAL_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
      error: validated.error,
    };
  }
  return validated;
}

export function journalRunCompletedEventType(namespace: string): string {
  return `${namespace}${JOURNAL_RUN_EVENT_TYPE_SUFFIX.COMPLETED}`;
}

export function isJournalRunCompletedEventType(type: string): boolean {
  return type.endsWith(JOURNAL_RUN_EVENT_TYPE_SUFFIX.COMPLETED);
}

/** Build a journal run-lifecycle event input carrying a run state's serialized record. */
export function journalRunEventInput(
  type: string,
  state: JournalRunState,
  meta: { readonly id: string; readonly time: string; readonly attempt: number },
): JournalEventInput {
  return {
    id: meta.id,
    source: JOURNAL_RUN_EVENT.SOURCE,
    type,
    time: meta.time,
    attempt: meta.attempt,
    data: journalRunStateRecord(state),
  };
}

/** Serialize a run state into its CloudEvents data record. */
export function journalRunStateRecord(state: JournalRunState): JsonRecord {
  return {
    branchName: state.branchName,
    branchSlug: state.branchSlug,
    targetKind: state.targetKind,
    ...(state.pullRequestNumber === undefined
      ? {}
      : { pullRequestNumber: state.pullRequestNumber }),
    headSha: state.headSha,
    baseRef: state.baseRef,
    ...(state.baseSha === undefined ? {} : { baseSha: state.baseSha }),
    configDigest: state.configDigest,
    participants: state.participants,
    scope: pathFilterRecord(state.scope),
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    outputPaths: state.outputPaths,
    status: state.status,
  };
}

export function isJournalRunStateStatus(
  value: unknown,
): value is JournalRunStateStatus {
  return (
    typeof value === "string"
    && Object.values(JOURNAL_RUN_STATE_STATUS).includes(
      value as JournalRunStateStatus,
    )
  );
}

export function isJournalTargetKind(
  value: unknown,
): value is JournalTargetKind {
  return (
    typeof value === "string"
    && Object.values(JOURNAL_TARGET_KIND).includes(value as JournalTargetKind)
  );
}

function validateJournalRunState(value: unknown): Result<JournalRunState> {
  if (!isRecord(value)) {
    return { ok: false, error: "journal run state must be an object" };
  }
  const identity = readRunStateIdentity(value);
  if (!identity.ok) return identity;
  const body = readRunStateBody(value);
  if (!body.ok) return body;
  return { ok: true, value: { ...identity.value, ...body.value } };
}

function readRunStateIdentity(
  value: Record<string, unknown>,
): Result<JournalRunStateIdentity> {
  const branchName = readString(value, JOURNAL_RUN_STATE_FIELDS.BRANCH_NAME);
  if (!branchName.ok) return branchName;
  const branchSlug = readString(value, JOURNAL_RUN_STATE_FIELDS.BRANCH_SLUG);
  if (!branchSlug.ok) return branchSlug;
  const targetKind = readTargetKind(
    value,
    JOURNAL_RUN_STATE_FIELDS.TARGET_KIND,
  );
  if (!targetKind.ok) return targetKind;
  const pullRequestNumber = readOptionalNonNegativeInteger(
    value,
    JOURNAL_RUN_STATE_FIELDS.PULL_REQUEST_NUMBER,
  );
  if (!pullRequestNumber.ok) return pullRequestNumber;
  const headSha = readString(value, JOURNAL_RUN_STATE_FIELDS.HEAD_SHA);
  if (!headSha.ok) return headSha;
  const baseRef = readString(value, JOURNAL_RUN_STATE_FIELDS.BASE_REF);
  if (!baseRef.ok) return baseRef;
  const baseSha = readOptionalString(value, JOURNAL_RUN_STATE_FIELDS.BASE_SHA);
  if (!baseSha.ok) return baseSha;
  return {
    ok: true,
    value: {
      branchName: branchName.value,
      branchSlug: branchSlug.value,
      targetKind: targetKind.value,
      ...(pullRequestNumber.value === undefined
        ? {}
        : { pullRequestNumber: pullRequestNumber.value }),
      headSha: headSha.value,
      baseRef: baseRef.value,
      ...(baseSha.value === undefined ? {} : { baseSha: baseSha.value }),
    },
  };
}

function readRunStateBody(
  value: Record<string, unknown>,
): Result<JournalRunStateBody> {
  const configDigest = readString(
    value,
    JOURNAL_RUN_STATE_FIELDS.CONFIG_DIGEST,
  );
  if (!configDigest.ok) return configDigest;
  const participants = readStringArray(
    value,
    JOURNAL_RUN_STATE_FIELDS.PARTICIPANTS,
  );
  if (!participants.ok) return participants;
  const scope = readPathFilter(value, JOURNAL_RUN_STATE_FIELDS.SCOPE);
  if (!scope.ok) return scope;
  const startedAt = readString(value, JOURNAL_RUN_STATE_FIELDS.STARTED_AT);
  if (!startedAt.ok) return startedAt;
  const completedAt = readString(value, JOURNAL_RUN_STATE_FIELDS.COMPLETED_AT);
  if (!completedAt.ok) return completedAt;
  const outputPaths = readStringArray(
    value,
    JOURNAL_RUN_STATE_FIELDS.OUTPUT_PATHS,
  );
  if (!outputPaths.ok) return outputPaths;
  const status = readStatus(value, JOURNAL_RUN_STATE_FIELDS.STATUS);
  if (!status.ok) return status;
  return {
    ok: true,
    value: {
      configDigest: configDigest.value,
      participants: participants.value,
      scope: scope.value,
      startedAt: startedAt.value,
      completedAt: completedAt.value,
      outputPaths: outputPaths.value,
      status: status.value,
    },
  };
}

function readString(
  value: Record<string, unknown>,
  field: string,
): Result<string> {
  const raw = value[field];
  return typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a non-empty string` };
}

function readOptionalString(
  value: Record<string, unknown>,
  field: string,
): Result<string | undefined> {
  const raw = value[field];
  if (raw === undefined) return { ok: true, value: undefined };
  return typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a non-empty string when present` };
}

function readOptionalNonNegativeInteger(
  value: Record<string, unknown>,
  field: string,
): Result<number | undefined> {
  const raw = value[field];
  if (raw === undefined) return { ok: true, value: undefined };
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0
    ? { ok: true, value: raw }
    : {
      ok: false,
      error: `${field} must be a non-negative integer when present`,
    };
}

function readStringArray(
  value: Record<string, unknown>,
  field: string,
): Result<readonly string[]> {
  const raw = value[field];
  return Array.isArray(raw)
      && raw.every((entry) => typeof entry === "string" && entry.length > 0)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be an array of non-empty strings` };
}

function readPathFilter(
  value: Record<string, unknown>,
  field: string,
): Result<PathFilterConfig> {
  return validatePathFilterConfig(value[field], field);
}

function pathFilterRecord(filter: PathFilterConfig): JsonRecord {
  return {
    ...(filter.include === undefined
      ? {}
      : { [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: filter.include }),
    ...(filter.exclude === undefined
      ? {}
      : { [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: filter.exclude }),
  };
}

function readStatus(
  value: Record<string, unknown>,
  field: string,
): Result<JournalRunStateStatus> {
  const raw = value[field];
  return isJournalRunStateStatus(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a terminal journal status` };
}

function readTargetKind(
  value: Record<string, unknown>,
  field: string,
): Result<JournalTargetKind> {
  const raw = value[field];
  return isJournalTargetKind(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a journal target kind` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
