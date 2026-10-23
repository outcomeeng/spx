/**
 * The terminal result of a guarded run: one exit code and one result line per way a run can end.
 *
 * @module lib/host-command-lock/result
 */
import { constants as osConstants } from "node:os";

import { SIGNAL_EXIT_CODE_BASE } from "@/lib/process-lifecycle";

export { SIGNAL_EXIT_CODE_BASE };

export const RESULT_SCHEMA = "spx.orchestration.lock.result.v1";

export const RESULT_STATUS = {
  COMPLETED: "completed",
  SIGNALED: "signaled",
  NOT_READY: "not_ready",
  INVALID_ARGUMENTS: "invalid_arguments",
  UNSUPPORTED_PLATFORM: "unsupported_platform",
  LOCK_FILE_ERROR: "lock_file_error",
  NESTED_CONTEXT_INVALID: "nested_context_invalid",
  NESTED_LOCK_MISMATCH: "nested_lock_mismatch",
  SPAWN_FAILED: "spawn_failed",
} as const;

export type ResultStatus = (typeof RESULT_STATUS)[keyof typeof RESULT_STATUS];

export const OUTCOME_KIND = {
  EXITED: "exited",
  SIGNALED: "signaled",
  NOT_READY: "not_ready",
  INVALID_ARGUMENTS: "invalid_arguments",
  UNSUPPORTED_PLATFORM: "unsupported_platform",
  LOCK_FILE_ERROR: "lock_file_error",
  NESTED_CONTEXT_INVALID: "nested_context_invalid",
  NESTED_LOCK_MISMATCH: "nested_lock_mismatch",
  SPAWN_FAILED: "spawn_failed",
} as const;

/** The exit code of a run whose wait cap expired before the command started. */
export const NOT_READY_EXIT_CODE = 3;

const FAILURES = {
  [OUTCOME_KIND.INVALID_ARGUMENTS]: { exitCode: 2, status: RESULT_STATUS.INVALID_ARGUMENTS },
  [OUTCOME_KIND.UNSUPPORTED_PLATFORM]: { exitCode: 4, status: RESULT_STATUS.UNSUPPORTED_PLATFORM },
  [OUTCOME_KIND.LOCK_FILE_ERROR]: { exitCode: 5, status: RESULT_STATUS.LOCK_FILE_ERROR },
  [OUTCOME_KIND.NESTED_CONTEXT_INVALID]: { exitCode: 6, status: RESULT_STATUS.NESTED_CONTEXT_INVALID },
  [OUTCOME_KIND.NESTED_LOCK_MISMATCH]: { exitCode: 7, status: RESULT_STATUS.NESTED_LOCK_MISMATCH },
  [OUTCOME_KIND.SPAWN_FAILED]: { exitCode: 127, status: RESULT_STATUS.SPAWN_FAILED },
} as const;

type FailureKind = keyof typeof FAILURES;

export type TerminalOutcome =
  | { readonly kind: typeof OUTCOME_KIND.EXITED; readonly code: number }
  | { readonly kind: typeof OUTCOME_KIND.SIGNALED; readonly signal: NodeJS.Signals }
  | { readonly kind: typeof OUTCOME_KIND.NOT_READY }
  | { readonly kind: FailureKind };

export interface ResultLine {
  readonly schema: typeof RESULT_SCHEMA;
  readonly runId: string;
  readonly started: boolean;
  readonly status: ResultStatus;
  readonly childExitCode?: number;
  readonly signal?: NodeJS.Signals;
}

export interface TerminalReport {
  readonly exitCode: number;
  readonly result: ResultLine;
}

/** Maps how a run ended to the process exit code and the result line. */
export function terminalOutcome(outcome: TerminalOutcome, runId = ""): TerminalReport {
  const base = { schema: RESULT_SCHEMA, runId } as const;
  switch (outcome.kind) {
    case OUTCOME_KIND.EXITED:
      return {
        exitCode: outcome.code,
        result: { ...base, started: true, status: RESULT_STATUS.COMPLETED, childExitCode: outcome.code },
      };
    case OUTCOME_KIND.SIGNALED:
      return {
        exitCode: SIGNAL_EXIT_CODE_BASE + osConstants.signals[outcome.signal],
        result: { ...base, started: true, status: RESULT_STATUS.SIGNALED, signal: outcome.signal },
      };
    case OUTCOME_KIND.NOT_READY:
      return {
        exitCode: NOT_READY_EXIT_CODE,
        result: { ...base, started: false, status: RESULT_STATUS.NOT_READY },
      };
    default: {
      const failure = FAILURES[outcome.kind];
      return {
        exitCode: failure.exitCode,
        result: { ...base, started: false, status: failure.status },
      };
    }
  }
}
