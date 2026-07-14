import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";
import type { Reporter, TestCase, TestModule } from "vitest/node";

import type {
  JournalRunTerminalStatus,
  TestFinding,
  TestRunEvidenceSink,
  TestScopeUnit,
  VitestRunStarter,
  VitestRunStartOptions,
} from "@/test/languages/journal-reporter";
import {
  createJournalReporter,
  createVitestRunStarter,
  JOURNAL_RUN_TERMINAL_STATUS,
  runTestsStreaming,
} from "@/test/languages/journal-reporter";
import type { GeneratedRunCase, GeneratedRunScenario } from "@testing/generators/testing/journal-reporter";
import { GENERATED_CASE_STATE } from "@testing/generators/testing/journal-reporter";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/** One recorded append against a recording evidence sink, preserving invocation order. */
export type RecordedSinkCall =
  | { readonly kind: "scope"; readonly unit: TestScopeUnit }
  | { readonly kind: "finding"; readonly finding: TestFinding };

/** A recording evidence sink: implements the reporter's port and records every append (Stage 5 exception 6: observability). */
export interface RecordingEvidenceSink extends TestRunEvidenceSink {
  readonly calls: readonly RecordedSinkCall[];
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
}

/** Builds a fresh in-memory recording evidence sink that records calls and performs no I/O. */
export function createRecordingEvidenceSink(): RecordingEvidenceSink {
  const calls: RecordedSinkCall[] = [];
  const scopes: TestScopeUnit[] = [];
  const findings: TestFinding[] = [];
  return {
    appendScope(unit: TestScopeUnit): void {
      scopes.push(unit);
      calls.push({ kind: "scope", unit });
    },
    appendFinding(finding: TestFinding): void {
      findings.push(finding);
      calls.push({ kind: "finding", finding });
    },
    get calls(): readonly RecordedSinkCall[] {
      return calls;
    },
    get scopes(): readonly TestScopeUnit[] {
      return scopes;
    },
    get findings(): readonly TestFinding[] {
      return findings;
    },
  };
}

/** A spy Vitest run-starter: records the options a journal-streaming run supplies without spawning Vitest. */
export interface SpyVitestRunStarter extends VitestRunStarter {
  readonly startedRuns: readonly VitestRunStartOptions[];
}

/** Builds a spy run-starter that records each `start` invocation and never spawns Vitest. */
export function createSpyVitestRunStarter(): SpyVitestRunStarter {
  const startedRuns: VitestRunStartOptions[] = [];
  return {
    start(options: VitestRunStartOptions): Promise<void> {
      startedRuns.push(options);
      return Promise.resolve();
    },
    get startedRuns(): readonly VitestRunStartOptions[] {
      return startedRuns;
    },
  };
}

/**
 * Asserts a fresh recording sink records the given scope and finding appends in
 * invocation order across both channels.
 */
export function assertRecordingSinkRecordsInOrder(
  scopes: readonly TestScopeUnit[],
  findings: readonly TestFinding[],
): void {
  const sink = createRecordingEvidenceSink();
  for (const unit of scopes) sink.appendScope(unit);
  for (const finding of findings) sink.appendFinding(finding);
  expect(sink.scopes).toEqual(scopes);
  expect(sink.findings).toEqual(findings);
  expect(sink.calls).toEqual([
    ...scopes.map((unit): RecordedSinkCall => ({ kind: "scope", unit })),
    ...findings.map((finding): RecordedSinkCall => ({ kind: "finding", finding })),
  ]);
}

// Minimal Vitest doubles carrying only the fields the reporter reads; the real
// TestModule / TestCase cannot be constructed outside a live run (Stage 5: contract probe).
function buildTestModuleDouble(moduleId: string): TestModule {
  return { moduleId } as unknown as TestModule;
}

function buildTestCaseDouble(moduleId: string, runCase: GeneratedRunCase): TestCase {
  return {
    module: { moduleId },
    fullName: runCase.testName,
    result: () => ({ state: runCase.state, errors: runCase.errors.map((message) => ({ message })) }),
  } as unknown as TestCase;
}

/** Fires a reporter's lifecycle hooks over a generated scenario in run order, sealing with the given reason. */
export function driveReporterOverScenario(
  reporter: Reporter,
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): void {
  const testModule = buildTestModuleDouble(scenario.moduleId);
  reporter.onTestModuleStart?.(testModule);
  for (const runCase of scenario.cases) {
    reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
  }
  reporter.onTestModuleEnd?.(testModule);
  reporter.onTestRunEnd?.([testModule], [], reason);
}

function expectedFindings(scenario: GeneratedRunScenario): readonly TestFinding[] {
  return scenario.cases
    .filter((runCase) => runCase.state === GENERATED_CASE_STATE.FAILED)
    .map((runCase) => ({ moduleId: scenario.moduleId, testName: runCase.testName, errors: runCase.errors }));
}

/** Asserts the reporter maps a scenario to one module scope, a finding per failing case, none per passing case, and the run reason to its terminal status. */
export function assertJournalReporterMapping(
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): void {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  driveReporterOverScenario(reporter, scenario, reason);
  expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
  expect(sink.findings).toEqual(expectedFindings(scenario));
  expect(reporter.terminalStatus).toBe(reason);
}

/**
 * Asserts the reporter appends each event as its hook fires: the module scope is
 * recorded on module start and a failing-case finding on that case's result, both
 * before run end rather than batched at the terminal event.
 */
export function assertReporterStreamsPerHook(scenario: GeneratedRunScenario): void {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  const testModule = buildTestModuleDouble(scenario.moduleId);
  reporter.onTestModuleStart?.(testModule);
  expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
  for (const runCase of scenario.cases) {
    reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
    if (runCase.state === GENERATED_CASE_STATE.FAILED) {
      expect(sink.findings.at(-1)).toEqual({
        moduleId: scenario.moduleId,
        testName: runCase.testName,
        errors: runCase.errors,
      });
    }
  }
}

/** Asserts a journal-streaming run registers the journal reporter on a programmatically started run through the injected starter, carrying no command-line reporter flag. */
export async function assertRunRegistersReporterProgrammatically(
  request: { readonly projectRoot: string; readonly testPaths: readonly string[] },
): Promise<void> {
  const starter = createSpyVitestRunStarter();
  await runTestsStreaming(request, { sink: createRecordingEvidenceSink(), starter });
  expect(starter.startedRuns).toHaveLength(1);
  expect(starter.startedRuns[0]?.reporters).toHaveLength(1);
  expect(starter.startedRuns[0]?.testPaths).toEqual(request.testPaths);
}

const VITEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");
// A committed inert suite holding one passing and one runtime-failing case in one
// module — the real-run counterpart of the sibling runner's single-outcome fixtures.
const MIXED_FIXTURE = "mixed.test.ts.fixture";
const MIXED_SUITE_NAME = "suite.test.ts";
const TEMP_PROJECT_PREFIX = "spx-journal-reporter-";

/**
 * Materializes the committed mixed-case fixture into a fresh temp project outside the
 * repository — so the programmatic run resolves no inherited Vitest config — and invokes
 * the callback with the project root and the copied suite's relative path.
 */
export function withMixedVitestProject(
  callback: (projectRoot: string, testFileName: string) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PROJECT_PREFIX, async (projectRoot) => {
    await copyFile(join(VITEST_FIXTURE_DIR, MIXED_FIXTURE), join(projectRoot, MIXED_SUITE_NAME));
    await callback(projectRoot, MIXED_SUITE_NAME);
  });
}

/**
 * Drives a real programmatic Vitest run over the mixed fixture with the production
 * starter and a recording sink, asserting the run records exactly one module scope and
 * one finding — for the failing case, carrying error text and the module's identity —
 * and yields the failed terminal status. The passing case records no finding.
 */
export async function assertRealRunStreamsScopeAndFinding(): Promise<void> {
  await withMixedVitestProject(async (projectRoot, testFileName) => {
    const sink = createRecordingEvidenceSink();
    const terminalStatus = await runTestsStreaming(
      { projectRoot, testPaths: [testFileName] },
      { sink, starter: createVitestRunStarter() },
    );
    expect(sink.scopes).toHaveLength(1);
    expect(sink.findings).toHaveLength(1);
    expect(sink.findings[0]?.moduleId).toBe(sink.scopes[0]?.moduleId);
    expect(sink.findings[0]?.errors.length).toBeGreaterThan(0);
    expect(terminalStatus).toBe(JOURNAL_RUN_TERMINAL_STATUS.FAILED);
  });
}
