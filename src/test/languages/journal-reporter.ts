/**
 * Journal-streaming test run: producer types and the evidence-sink port.
 *
 * The custom Vitest reporter translates per-module and per-case lifecycle events
 * into these producer values and forwards them to an injected TestRunEvidenceSink.
 * The verification executor supplies a sink backed by the recorder's evidence-append
 * ports; tests supply a recording sink. The reporter constructs no journal events
 * and performs no I/O — every durable effect flows through the sink.
 */
import type { Reporter, TestCase, TestModule, TestRunEndReason } from "vitest/node";

import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type TestRunEvidenceSink,
} from "@/test/languages/types";

/** How a journal-streaming run starts Vitest: the scope to run and the reporters registered on it. */
export interface VitestRunStartOptions {
  /** Project root the run executes against. */
  readonly projectRoot: string;
  /** Test file paths the run covers; empty runs the runner's full scope. */
  readonly testPaths: readonly string[];
  /** Reporters registered on the run — the journal reporter among them. */
  readonly reporters: readonly Reporter[];
}

/**
 * Starts a programmatic Vitest run with the given reporters registered through the
 * Node API. Production wires `startVitest`; tests inject a spy that records the
 * options without spawning Vitest.
 */
export interface VitestRunStarter {
  start(options: VitestRunStartOptions): Promise<void>;
}

/** The Vitest case-result state the reporter records as a finding. */
const VITEST_FAILED_CASE_STATE = "failed";

/** A journal reporter: a Vitest reporter streaming scope and finding evidence, plus the terminal status it captured. */
export interface JournalReporter extends Reporter {
  /** The terminal status captured from the run's end reason, or undefined before the run ends. */
  readonly terminalStatus: JournalRunTerminalStatus | undefined;
}

function terminalStatusFromReason(reason: TestRunEndReason): JournalRunTerminalStatus {
  return (
    Object.values(JOURNAL_RUN_TERMINAL_STATUS).find((status) => status === reason)
      ?? JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED
  );
}

function findingErrorMessages(errors: ReadonlyArray<{ readonly message?: string }>): readonly string[] {
  return errors.map((error) => error.message ?? "");
}

/**
 * Builds a journal reporter that forwards each Vitest lifecycle event to the sink as
 * it fires: a started module records a scope, a failing case records a finding, a
 * passing case records nothing, and run end captures the terminal status. Each hook
 * awaits its sink append before returning, and Vitest awaits the hook, so an async
 * sink's write completes before the run advances to the next hook or run end.
 * Constructs no journal events and performs no I/O — every durable effect flows
 * through the sink.
 */
export function createJournalReporter(sink: TestRunEvidenceSink): JournalReporter {
  let terminalStatus: JournalRunTerminalStatus | undefined;
  return {
    async onTestModuleStart(module: TestModule): Promise<void> {
      await sink.appendScope({ moduleId: module.moduleId });
    },
    async onTestCaseResult(testCase: TestCase): Promise<void> {
      const result = testCase.result();
      if (result.state !== VITEST_FAILED_CASE_STATE) return;
      await sink.appendFinding({
        moduleId: testCase.module.moduleId,
        testName: testCase.fullName,
        errors: findingErrorMessages(result.errors),
      });
    },
    onTestRunEnd(_modules, _errors, reason: TestRunEndReason): void {
      terminalStatus = terminalStatusFromReason(reason);
    },
    get terminalStatus(): JournalRunTerminalStatus | undefined {
      return terminalStatus;
    },
  };
}

/** Dependencies a journal-streaming Vitest run is driven with: the evidence sink and the Vitest run-starter. */
export interface JournalRunDependencies {
  readonly sink: TestRunEvidenceSink;
  readonly starter: VitestRunStarter;
}

/**
 * Drives a journal-streaming Vitest run: registers a journal reporter forwarding to
 * the sink, starts the run through the injected starter, and returns the terminal
 * status the reporter captured.
 */
export async function runTestsStreaming(
  request: JournalRunRequest,
  deps: JournalRunDependencies,
): Promise<JournalRunTerminalStatus> {
  const reporter = createJournalReporter(deps.sink);
  await deps.starter.start({
    projectRoot: request.projectRoot,
    testPaths: request.testPaths,
    reporters: [reporter],
  });
  return reporter.terminalStatus ?? JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED;
}

/**
 * Builds the production Vitest run starter: it loads Vitest's Node API lazily, starts
 * a single non-watch run rooted at the request's project root with the given reporters
 * registered on it, and closes the instance when the run resolves. Vitest is loaded
 * through a dynamic import so the heavy Node API stays off this module's import path
 * and resolves only when a run actually starts. A run that observes a failing case sets
 * `process.exitCode`, which the starter restores around the run so a streaming run whose
 * findings come from failing cases never leaks a non-zero exit code to its caller.
 */
export function createVitestRunStarter(): VitestRunStarter {
  return {
    async start(options: VitestRunStartOptions): Promise<void> {
      const { startVitest } = await import("vitest/node");
      const priorExitCode = process.exitCode;
      try {
        const vitest = await startVitest("test", [...options.testPaths], {
          root: options.projectRoot,
          watch: false,
          reporters: [...options.reporters],
        });
        await vitest.close();
      } finally {
        process.exitCode = priorExitCode;
      }
    },
  };
}
