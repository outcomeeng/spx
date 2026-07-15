/**
 * The spx-driven verification executor core.
 *
 * The executor drives a verification type's deterministic runner over a scope and records the run
 * only through the verify recorder lifecycle operations of `spx/34-verification.enabler/32-verify.enabler`.
 * Within one invocation it opens a run in spx drive mode, backs the streaming runner's evidence sink
 * with the recorder's scope-append and finding-append operations, maps the runner's terminal status
 * onto the recorder terminal-status vocabulary through a total function, and finishes and seals the
 * run — constructing no journal event and performing no journal I/O itself. The runner and recorder
 * operations arrive through injected parameters, so the executor names no language and verifies
 * against controlled implementations.
 */
import { JOURNAL_RUN_STATE_STATUS, type JournalRunStateStatus } from "@/domains/journal/run-state";
import type { RunLocator } from "@/domains/verify/verify";
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunInvocation,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type JournalStreamRunDependencies,
  type TestFinding,
  type TestRunEvidenceSink,
  type TestScopeUnit,
} from "@/test/languages/types";

/**
 * A verification type's streaming runner: drives a run over a scope, streaming per-module scope and
 * per-failing-case findings into the injected sink and yielding the run's terminal status. The
 * executor reaches one of these through the verification type's registry without naming a language.
 */
export interface JournalStreamingRunner {
  runTestsStreaming(
    request: JournalRunRequest,
    deps: JournalStreamRunDependencies,
  ): Promise<JournalRunInvocation>;
}

/**
 * The verify recorder lifecycle operations the executor composes to record an spx-driven run. Each
 * operation records through `spx/34-verification.enabler/32-verify.enabler`; the executor constructs
 * no journal event of its own.
 */
export interface ExecutorRecorderOperations {
  /** Opens a run in spx drive mode over the scope, returning its locator. */
  open(request: ExecutorRunRequest): Promise<RunLocator>;
  /** Records one inspected test module as run scope. */
  appendScope(run: RunLocator, unit: TestScopeUnit): Promise<void>;
  /** Records one failing test case as a run finding. */
  appendFinding(run: RunLocator, finding: TestFinding): Promise<void>;
  /** Records terminal completion with the run's terminal status and seals the run. */
  finish(run: RunLocator, terminalStatus: JournalRunStateStatus): Promise<void>;
}

/** The scope an spx-driven run covers: the verification type, the run scope, and the runner's inputs. */
export interface ExecutorRunRequest {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly productDir: string;
  readonly testPaths: readonly string[];
}

/** The executor's dependencies: the verification-type→runner resolver and the recorder operations it composes. */
export interface ExecutorDependencies {
  readonly resolveRunner: (verificationType: string) => JournalStreamingRunner | undefined;
  readonly recorder: ExecutorRecorderOperations;
}

/**
 * The outcome of an spx-driven run: an unsupported verification type opens no run, otherwise the run
 * executes and yields its locator and the terminal status the executor recorded.
 */
export type ExecutorRunResult =
  | { readonly executed: false }
  | { readonly executed: true; readonly run: RunLocator; readonly terminalStatus: JournalRunStateStatus };

/**
 * Map a runner's terminal status onto the recorder terminal-status vocabulary through a total,
 * information-preserving function. The runner reports `passed`, `failed`, or `interrupted`; the
 * recorder shares those three, so each maps to exactly one recorder status and a deterministic test
 * pass records as `passed` rather than routing through the agentic `approved` disposition.
 */
const RUNNER_TO_RECORDER_STATUS: Readonly<Record<JournalRunTerminalStatus, JournalRunStateStatus>> = {
  [JOURNAL_RUN_TERMINAL_STATUS.PASSED]: JOURNAL_RUN_STATE_STATUS.PASSED,
  [JOURNAL_RUN_TERMINAL_STATUS.FAILED]: JOURNAL_RUN_STATE_STATUS.FAILED,
  [JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED]: JOURNAL_RUN_STATE_STATUS.INTERRUPTED,
};

/** The recorder terminal status a gated-out run seals with: the runner completed no work. */
const GATED_OUT_TERMINAL_STATUS: JournalRunStateStatus = JOURNAL_RUN_STATE_STATUS.INTERRUPTED;

export function recorderTerminalStatusFor(status: JournalRunTerminalStatus): JournalRunStateStatus {
  return RUNNER_TO_RECORDER_STATUS[status];
}

/**
 * Execute a verification run: resolve the type's runner, open a run in spx drive mode, drive the
 * runner while streaming its scope and findings into the run through the recorder, and finish the
 * run with the mapped terminal status. An unsupported verification type opens no run.
 */
export async function executeVerificationRun(
  request: ExecutorRunRequest,
  deps: ExecutorDependencies,
): Promise<ExecutorRunResult> {
  const runner = deps.resolveRunner(request.verificationType);
  if (runner === undefined) return { executed: false };

  const run = await deps.recorder.open(request);
  const sink: TestRunEvidenceSink = {
    appendScope: (unit) => deps.recorder.appendScope(run, unit),
    appendFinding: (finding) => deps.recorder.appendFinding(run, finding),
  };
  let invocation: JournalRunInvocation;
  try {
    invocation = await runner.runTestsStreaming(
      { productDir: request.productDir, testPaths: request.testPaths },
      { sink },
    );
  } catch (failure) {
    // The executor owns the open-stream-seal lifecycle, so a runner failure finishes the opened run
    // interrupted before the failure surfaces rather than leaving an unsealed run behind.
    await deps.recorder.finish(run, GATED_OUT_TERMINAL_STATUS);
    throw failure;
  }
  const terminalStatus = invocation.invoked
    ? recorderTerminalStatusFor(invocation.terminalStatus)
    : GATED_OUT_TERMINAL_STATUS;
  await deps.recorder.finish(run, terminalStatus);
  return { executed: true, run, terminalStatus };
}
