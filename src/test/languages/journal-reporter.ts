/**
 * Journal-streaming test run: producer types and the evidence-sink port.
 *
 * The custom Vitest reporter translates per-module and per-case lifecycle events
 * into these producer values and forwards them to an injected TestRunEvidenceSink.
 * The verification executor supplies a sink backed by the recorder's evidence-append
 * ports; tests supply a recording sink. The reporter constructs no journal events
 * and performs no I/O — every durable effect flows through the sink. Governed by
 * the reporter architecture decision at
 * spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler.
 */
import type { Reporter } from "vitest/node";

/** A unit of test coverage a journal-streaming run reports: one test module. */
export interface TestScopeUnit {
  /** The Vitest module identity (its resolved file path). */
  readonly moduleId: string;
}

/** A validated problem a journal-streaming run reports: one failing test case. */
export interface TestFinding {
  /** The module the failing case belongs to. */
  readonly moduleId: string;
  /** The failing case's full name within its module. */
  readonly testName: string;
  /** The error messages the case failed with. */
  readonly errors: readonly string[];
}

/** The evidence-append port the reporter forwards scope and finding events to. */
export interface TestRunEvidenceSink {
  /** Records that a test module was covered by the run. */
  appendScope(unit: TestScopeUnit): void;
  /** Records that a test case failed. */
  appendFinding(finding: TestFinding): void;
}

/** Terminal statuses a journal-streaming run yields for the executor to seal with. */
export const JOURNAL_RUN_TERMINAL_STATUS = {
  PASSED: "passed",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
} as const;

/** Terminal status a journal-streaming run yields for the executor to seal with. */
export type JournalRunTerminalStatus = (typeof JOURNAL_RUN_TERMINAL_STATUS)[keyof typeof JOURNAL_RUN_TERMINAL_STATUS];

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
