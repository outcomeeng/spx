/**
 * The production verify-recorder operations the executor composes.
 *
 * This adapter backs `ExecutorRecorderOperations` with the verify recorder command lifecycle of
 * `spx/34-verification.enabler/32-verify.enabler`: `open` starts a run in spx drive mode, the append
 * operations record inspected scope and validated findings, and `finish` seals the run. It
 * constructs no journal event and reads or writes no journal storage directly — the recorder
 * commands own event construction and backend binding. The recorder dependencies (state store, git,
 * clock, input reader, journal binding) arrive through the config, so the same adapter serves
 * production wiring and controlled in-memory tests.
 */
import {
  VERIFY_CLI_EXIT_CODE,
  type VerifyAppendCliOptions,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyFinishCommand,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { JournalRunStateStatus } from "@/domains/journal/run-state";
import { type RunLocator, VERIFY_DRIVE_MODE } from "@/domains/verify/verify";
import type { TestFinding, TestScopeUnit } from "@/test/languages/types";

import type { ExecutorRecorderOperations, ExecutorRunRequest } from "@/commands/verification-exec/executor";

/** The separator joining a finding's module and case name into its idempotency key. */
export const FINDING_KEY_SEPARATOR = "::";

/** The failure prefixes the recorder operations raise when a recorder command reports a non-OK exit. */
export const RECORDER_OPERATION_ERROR = {
  OPEN_FAILED: "verify recorder open failed",
  SCOPE_FAILED: "verify recorder scope append failed",
  FINDING_FAILED: "verify recorder finding append failed",
  FINISH_FAILED: "verify recorder finish failed",
} as const;

/** The recorder dependencies and the verification input the executor's recorder operations record through. */
export interface RecorderOperationsConfig {
  /** The verification input source recorded at start, replayed by the recorder's `input` verb. */
  readonly input: string;
  /** The recorder dependencies: state store, git, clock, input reader, and journal binding. */
  readonly deps: VerifyCliDeps;
}

/** The idempotency key for one inspected test module: the module identity records at most once. */
function scopeIdempotencyKey(unit: TestScopeUnit): string {
  return unit.moduleId;
}

/** The idempotency key for one failing case: the module and case name record at most once. */
function findingIdempotencyKey(finding: TestFinding): string {
  return `${finding.moduleId}${FINDING_KEY_SEPARATOR}${finding.testName}`;
}

function appendOptions(
  run: RunLocator,
  payload: unknown,
  idempotencyKey: string,
): VerifyAppendCliOptions {
  return {
    verificationType: run.verificationType,
    scopeType: run.scopeType,
    scope: run.scopeIdentity,
    run: run.runToken,
    payload: JSON.stringify(payload),
    idempotencyKey,
  };
}

function raiseOnFailure(result: CliCommandResult, prefix: string): void {
  if (result.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`${prefix}: ${result.output}`);
  }
}

/** Compose the verify recorder command lifecycle into the executor's recorder operations. */
export function createRecorderOperations(config: RecorderOperationsConfig): ExecutorRecorderOperations {
  const deps: VerifyCliDeps = { ...config.deps, driveMode: VERIFY_DRIVE_MODE.SPX };
  const appendDeps: VerifyCliDeps = { ...deps, readPayloadSource: async (source) => source };

  return {
    async open(request: ExecutorRunRequest): Promise<RunLocator> {
      const started = await verifyStartCommand(
        {
          verificationType: request.verificationType,
          scopeType: request.scopeType,
          scope: request.scope,
          input: config.input,
        },
        deps,
      );
      raiseOnFailure(started, RECORDER_OPERATION_ERROR.OPEN_FAILED);
      return (JSON.parse(started.output) as VerifyStartReport).locator;
    },
    async appendScope(run: RunLocator, unit: TestScopeUnit): Promise<void> {
      const result = await verifyAppendScopeCommand(
        appendOptions(run, unit, scopeIdempotencyKey(unit)),
        appendDeps,
      );
      raiseOnFailure(result, RECORDER_OPERATION_ERROR.SCOPE_FAILED);
    },
    async appendFinding(run: RunLocator, finding: TestFinding): Promise<void> {
      const result = await verifyAppendFindingCommand(
        appendOptions(run, finding, findingIdempotencyKey(finding)),
        appendDeps,
      );
      raiseOnFailure(result, RECORDER_OPERATION_ERROR.FINDING_FAILED);
    },
    async finish(run: RunLocator, terminalStatus: JournalRunStateStatus): Promise<void> {
      const finished = await verifyFinishCommand(
        {
          verificationType: run.verificationType,
          scopeType: run.scopeType,
          scope: run.scopeIdentity,
          run: run.runToken,
          terminalStatus,
        },
        deps,
      );
      raiseOnFailure(finished, RECORDER_OPERATION_ERROR.FINISH_FAILED);
    },
  };
}
