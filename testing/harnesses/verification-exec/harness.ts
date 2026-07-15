/**
 * Test harness for the spx-driven verification executor
 * (`spx/34-verification.enabler/43-execute.enabler`).
 *
 * The executor is driven over the real verify recorder wired to an in-memory state store, so its
 * evidence flows through the same recorder lifecycle production uses. The runner is a controlled
 * `JournalStreamingRunner` double that streams configured scope units and findings into the injected
 * sink and yields a configured terminal status — no real Vitest run at `l1`. Controlled scope units,
 * findings, and terminal statuses come from the journal-reporter generators, which own the
 * journal-streaming evidence domain.
 */
import { expect } from "vitest";

import {
  executeVerificationRun,
  type ExecutorRecorderOperations,
  type ExecutorRunRequest,
  type JournalStreamingRunner,
  recorderTerminalStatusFor,
  resolveTestRunner,
  resolveVerificationRunner,
} from "@/commands/verification-exec";
import { createRecorderOperations, RECORDER_OPERATION_ERROR } from "@/commands/verification-exec/recorder-operations";
import { verifyRenderCommand, verifyStatusCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS, type JournalRunStateStatus } from "@/domains/journal/run-state";
import {
  driveModeOf,
  type RunLocator,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_EVENT_SOURCE,
  VERIFY_INPUT_SOURCE,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JournalEvent } from "@/lib/agent-run-journal";
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunInvocation,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type JournalStreamRunDependencies,
  type TestFinding,
  type TestingLanguageDescriptor,
  type TestScopeUnit,
} from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  JOURNAL_REPORTER_TEST_GENERATOR,
  sampleJournalReporterValue,
} from "@testing/generators/testing/journal-reporter";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createVerifyRunContextScenario,
  parseRenderReport,
  parseStatusReport,
  verifyDeps,
  verifyRenderOptions,
  type VerifyRunContextScenario,
  type VerifyStateStoreFileSystem,
  verifyStatusOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

/** The configured output of a controlled runner: the scope and findings it streams and the status it yields. */
interface ControlledRunOutcome {
  readonly scopeUnits: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
  readonly invocation: JournalRunInvocation;
}

/** A controlled runner that streams a configured outcome into the sink and records the request it received. */
interface ControlledRunner {
  readonly runner: JournalStreamingRunner;
  request(): JournalRunRequest | undefined;
}

function createControlledRunner(outcome: ControlledRunOutcome): ControlledRunner {
  let captured: JournalRunRequest | undefined;
  return {
    runner: {
      async runTestsStreaming(
        request: JournalRunRequest,
        deps: JournalStreamRunDependencies,
      ): Promise<JournalRunInvocation> {
        captured = request;
        for (const unit of outcome.scopeUnits) await deps.sink.appendScope(unit);
        for (const finding of outcome.findings) await deps.sink.appendFinding(finding);
        return outcome.invocation;
      },
    },
    request: () => captured,
  };
}

/** A recorder that counts each lifecycle call while delegating to a real recorder underneath. */
interface RecorderSpy {
  readonly recorder: ExecutorRecorderOperations;
  openCalls(): number;
  scopeCalls(): number;
  findingCalls(): number;
  finishCalls(): number;
}

function spyOnRecorder(base: ExecutorRecorderOperations): RecorderSpy {
  let open = 0;
  let scope = 0;
  let finding = 0;
  let finish = 0;
  return {
    recorder: {
      open: async (request) => {
        open += 1;
        return base.open(request);
      },
      appendScope: async (run, unit) => {
        scope += 1;
        return base.appendScope(run, unit);
      },
      appendFinding: async (run, foundFinding) => {
        finding += 1;
        return base.appendFinding(run, foundFinding);
      },
      finish: async (run, status) => {
        finish += 1;
        return base.finish(run, status);
      },
    },
    openCalls: () => open,
    scopeCalls: () => scope,
    findingCalls: () => finding,
    finishCalls: () => finish,
  };
}

/** The real verify recorder wired to a fresh in-memory state store, plus the scenario and request the executor drives. */
interface ExecutorHarness {
  readonly scenario: VerifyRunContextScenario;
  readonly fs: VerifyStateStoreFileSystem;
  readonly recorder: ExecutorRecorderOperations;
  readonly request: ExecutorRunRequest;
}

function createExecutorHarness(): ExecutorHarness {
  const scenario = withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.TEST);
  const fs = createInMemoryStateStoreFileSystem();
  const recorder = createRecorderOperations({
    input: VERIFY_INPUT_SOURCE.STDIN,
    deps: verifyDeps(scenario, fs),
  });
  const runRequest = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest());
  const request: ExecutorRunRequest = {
    verificationType: VERIFY_VERIFICATION_TYPE.TEST,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    productDir: runRequest.productDir,
    testPaths: runRequest.testPaths,
  };
  return { scenario, fs, recorder, request };
}

async function renderRunReport(
  harness: ExecutorHarness,
  runToken: string,
): Promise<ReturnType<typeof parseRenderReport>> {
  return parseRenderReport(
    (await verifyRenderCommand(
      verifyRenderOptions(harness.scenario, runToken),
      verifyDeps(harness.scenario, harness.fs),
    )).output,
  );
}

async function renderRunEvents(
  harness: ExecutorHarness,
  runToken: string,
): Promise<readonly JournalEvent[]> {
  return (await renderRunReport(harness, runToken)).events;
}

function eventsOfType(events: readonly JournalEvent[], type: string): readonly JournalEvent[] {
  return events.filter((event) => event.type === type);
}

function passingScopeOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED },
  };
}

function failingMixedOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  };
}

/** A gated-out outcome: detection gated the runner out, so it streams no scope or finding and reports no terminal status. */
function gatedOutOutcome(): ControlledRunOutcome {
  return { scopeUnits: [], findings: [], invocation: { invoked: false } };
}

/** An outcome whose runner reports an interrupted terminal status after streaming one inspected unit. */
function interruptedRunnerOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED },
  };
}

/**
 * Scenario S1: spx drives the type's runner over the scope, records the run through the verify
 * lifecycle, and reports the run locator the recorder returns.
 */
export async function assertExecutorDrivesRunnerAndReportsLocator(): Promise<void> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(passingScopeOutcome());

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  expect(result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.PASSED);
  expect(result.run.runToken.length).toBeGreaterThan(0);
  expect(result.run.verificationType).toBe(VERIFY_VERIFICATION_TYPE.TEST);
  expect(result.run.scopeIdentity).toBe(harness.request.scope);

  const driven = controlled.request();
  expect(driven?.productDir).toBe(harness.request.productDir);
  expect(driven?.testPaths).toEqual(harness.request.testPaths);

  const events = await renderRunEvents(harness, result.run.runToken);
  expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
}

/**
 * Scenario S2: a passing unit records a scope event, a failing unit records a finding, and the run
 * finishes with the terminal status derived from the runner's mapped report.
 */
export async function assertExecutorRecordsScopeFindingAndTerminal(): Promise<void> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(failingMixedOutcome());

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  expect(result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);

  const report = await renderRunReport(harness, result.run.runToken);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
  expect(report.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
  expect(report.sealed).toBe(true);
}

/**
 * Scenario: a failing case whose runner-reported errors carry no message records as a finding — the
 * recorder accepts the reporter's message-absent fallback (empty error strings) that the producer
 * legitimately emits, rather than rejecting the finding.
 */
export async function assertExecutorRecordsFindingWithoutErrorMessages(): Promise<void> {
  const harness = createExecutorHarness();
  const finding = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.findingWithoutErrorMessages());
  const controlled = createControlledRunner({
    scopeUnits: [],
    findings: [finding],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  });

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  const report = await renderRunReport(harness, result.run.runToken);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
  expect(report.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
}

/**
 * Compliance C1: the executor records scope, finding, and terminal evidence only through the verify
 * recorder lifecycle operations, never constructing a journal event of its own.
 */
export async function assertExecutorRecordsOnlyThroughRecorderOperations(): Promise<void> {
  const harness = createExecutorHarness();
  const outcome = failingMixedOutcome();
  const controlled = createControlledRunner(outcome);
  const spy = spyOnRecorder(harness.recorder);

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: spy.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;

  expect(spy.openCalls()).toBe(1);
  expect(spy.scopeCalls()).toBe(outcome.scopeUnits.length);
  expect(spy.findingCalls()).toBe(outcome.findings.length);
  expect(spy.finishCalls()).toBe(1);

  const events = await renderRunEvents(harness, result.run.runToken);
  const evidenceEvents = [
    ...eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE),
    ...eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING),
    ...eventsOfType(events, VERIFY_TERMINAL_EVENT_TYPE),
    ...eventsOfType(events, VERIFY_RUN_CONTEXT_EVENT_TYPE),
  ];
  expect(evidenceEvents.length).toBeGreaterThan(0);
  for (const event of evidenceEvents) {
    expect(event.source).toBe(VERIFY_EVENT_SOURCE);
  }
}

/**
 * Compliance C2: the executor opens the run in spx drive mode, so the recorder projection advertises
 * no caller evidence-append action for the unsealed run.
 */
export async function assertExecutorOpensSpxDrivenRunWithoutEvidenceAppendActions(): Promise<void> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(failingMixedOutcome());

  let unsealedDriveMode: string | undefined;
  let unsealedNextActions: readonly string[] | undefined;
  const recorder: ExecutorRecorderOperations = {
    ...harness.recorder,
    finish: async (run, status) => {
      const statusReport = parseStatusReport(
        (await verifyStatusCommand(
          verifyStatusOptions(harness.scenario, run.runToken),
          verifyDeps(harness.scenario, harness.fs),
        )).output,
      );
      unsealedDriveMode = statusReport.driveMode;
      unsealedNextActions = statusReport.nextActions;
      return harness.recorder.finish(run, status);
    },
  };

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder,
  });

  expect(result.executed).toBe(true);
  expect(unsealedDriveMode).toBe(VERIFY_DRIVE_MODE.SPX);
  expect(unsealedNextActions).toBeDefined();
  expect(unsealedNextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
  expect(unsealedNextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
  expect(unsealedNextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);

  const events = await renderRunEvents(
    harness,
    (result as { readonly run: { readonly runToken: string } }).run.runToken,
  );
  expect(driveModeOf(events)).toBe(VERIFY_DRIVE_MODE.SPX);
}

/** A controlled language descriptor whose journal-streaming run the resolver must reach through the registry. */
function createControlledLanguageDescriptor(
  runTestsStreaming: TestingLanguageDescriptor["runTestsStreaming"],
): TestingLanguageDescriptor {
  return {
    name: arbitraryDomainLiteralValue(),
    testFilePatterns: [],
    productInputPaths: [],
    matchesTestFile: () => false,
    excludeFlag: () => arbitraryDomainLiteralValue(),
    detect: () => true,
    runTests: async () => ({ invoked: false }),
    runTestsStreaming,
  };
}

function arbitraryDomainLiteralValue(): string {
  return sampleJournalReporterValue(arbitraryDomainLiteral());
}

/** A streaming descriptor that yields a fixed terminal status without streaming evidence, for fold coverage. */
function streamingDescriptorYielding(status: JournalRunTerminalStatus): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(async () => ({ invoked: true, terminalStatus: status }));
}

/** A descriptor whose detection gates its streaming run out, contributing no terminal status to the fold. */
function gatedOutDescriptor(): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(async () => ({ invoked: false }));
}

/** A descriptor that exposes no journal-streaming run at all, so the resolver skips it. */
function nonStreamingDescriptor(): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(undefined);
}

/** Drive the test runner over a controlled registry and return the folded invocation. */
async function foldRegistryInvocation(registry: TestingRegistry): Promise<JournalRunInvocation> {
  return resolveTestRunner(registry).runTestsStreaming(
    sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
    { sink: { appendScope: () => undefined, appendFinding: () => undefined } },
  );
}

/**
 * Compliance C3: the executor reaches the `test` type's runner through the testing registry and
 * names no language — the resolver drives whatever descriptors the registry enumerates — while an
 * unsupported verification type resolves to no runner.
 */
export async function assertExecutorReachesRunnerThroughRegistry(): Promise<void> {
  expect(resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.TEST)).not.toBeUndefined();
  expect(resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.AUDIT)).toBeUndefined();

  const streamedUnit = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const controlledDescriptor = createControlledLanguageDescriptor(
    async (_request: JournalRunRequest, deps: JournalStreamRunDependencies): Promise<JournalRunInvocation> => {
      await deps.sink.appendScope(streamedUnit);
      return { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED };
    },
  );
  const registry: TestingRegistry = { languages: [controlledDescriptor] };

  const streamed: TestScopeUnit[] = [];
  const invocation = await resolveTestRunner(registry).runTestsStreaming(
    sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
    { sink: { appendScope: (unit) => void streamed.push(unit), appendFinding: () => undefined } },
  );

  expect(streamed).toEqual([streamedUnit]);
  expect(invocation).toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED });
}

/**
 * Compliance: a verification type that resolves to no runner opens no run — spx reports the run not
 * executed and drives no recorder lifecycle operation, so no journal I/O occurs for an unsupported type.
 */
export async function assertExecutorGatesUnsupportedTypeWithoutRecording(): Promise<void> {
  const harness = createExecutorHarness();
  const spy = spyOnRecorder(harness.recorder);

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => undefined,
    recorder: spy.recorder,
  });

  expect(result.executed).toBe(false);
  expect(spy.openCalls()).toBe(0);
  expect(spy.scopeCalls()).toBe(0);
  expect(spy.findingCalls()).toBe(0);
  expect(spy.finishCalls()).toBe(0);
}

/**
 * Scenario: a runner that detection gates out reports no work, so spx records no scope or finding and
 * finishes the run with the interrupted terminal status the recorder derives for a gated-out run.
 */
export async function assertExecutorSealsGatedOutRunAsInterrupted(): Promise<void> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(gatedOutOutcome());

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  expect(result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);

  const report = await renderRunReport(harness, result.run.runToken);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(0);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
  expect(report.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
  expect(report.sealed).toBe(true);
}

/**
 * Compliance: each recorder lifecycle operation surfaces a non-OK recorder command as a raised failure
 * rather than swallowing it — `open` over a malformed scope, and scope, finding, and finish over a run
 * token the store never opened, each raise their operation's failure prefix.
 */
export async function assertRecorderRaisesWhenLifecycleCommandFails(): Promise<void> {
  const harness = createExecutorHarness();
  const scopeUnit = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const finding = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.finding());

  await expect(
    harness.recorder.open({ ...harness.request, scope: sampleJournalReporterValue(arbitraryDomainLiteral()) }),
  ).rejects.toThrow(RECORDER_OPERATION_ERROR.OPEN_FAILED);

  const opened = await harness.recorder.open(harness.request);
  const missingRun: RunLocator = {
    ...opened,
    runToken: sampleJournalReporterValue(arbitraryDomainLiteral()),
  };

  await expect(harness.recorder.appendScope(missingRun, scopeUnit)).rejects.toThrow(
    RECORDER_OPERATION_ERROR.SCOPE_FAILED,
  );
  await expect(harness.recorder.appendFinding(missingRun, finding)).rejects.toThrow(
    RECORDER_OPERATION_ERROR.FINDING_FAILED,
  );
  await expect(
    harness.recorder.finish(missingRun, JOURNAL_RUN_STATE_STATUS.INTERRUPTED),
  ).rejects.toThrow(RECORDER_OPERATION_ERROR.FINISH_FAILED);
}

/**
 * Scenario: a runner that reports an interrupted terminal status finishes the run with the interrupted
 * recorder status the terminal-status map derives — the invoked-runner mapping, distinct from the
 * gated-out path — after recording the unit it streamed before interruption.
 */
export async function assertExecutorMapsInterruptedRunnerReport(): Promise<void> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(interruptedRunnerOutcome());

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  expect(result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);

  const report = await renderRunReport(harness, result.run.runToken);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
  expect(report.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
  expect(report.sealed).toBe(true);
}

/**
 * Mapping: the executor's terminal-status function is total over the runner's terminal-status domain,
 * carrying each of `passed`, `failed`, and `interrupted` onto its information-preserving recorder
 * status — passed→passed, failed→failed, interrupted→interrupted. The mapping's input column equals the
 * whole runner terminal-status enum (totality), and its output column carries distinct recorder statuses
 * (no two runner statuses collapse onto one), so every runner terminal status maps to exactly one
 * recorder terminal status.
 */
export function assertExecutorMapsEveryRunnerTerminalStatus(): void {
  const mapping: ReadonlyArray<readonly [JournalRunTerminalStatus, JournalRunStateStatus]> = [
    [JOURNAL_RUN_TERMINAL_STATUS.PASSED, JOURNAL_RUN_STATE_STATUS.PASSED],
    [JOURNAL_RUN_TERMINAL_STATUS.FAILED, JOURNAL_RUN_STATE_STATUS.FAILED],
    [JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED, JOURNAL_RUN_STATE_STATUS.INTERRUPTED],
  ];

  expect(mapping.map(([runner]) => runner)).toEqual(Object.values(JOURNAL_RUN_TERMINAL_STATUS));
  for (const [runner, expectedRecorderStatus] of mapping) {
    expect(recorderTerminalStatusFor(runner)).toBe(expectedRecorderStatus);
  }
  expect(new Set(mapping.map(([, recorderStatus]) => recorderStatus)).size).toBe(mapping.length);
}

/**
 * Compliance: a failing language folds the run's terminal status to failed, taking precedence over
 * passing and interrupted languages that ran alongside it.
 */
export async function assertTestRunnerFoldsFailedTerminalStatus(): Promise<void> {
  const invocation = await foldRegistryInvocation({
    languages: [
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.PASSED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.FAILED),
    ],
  });
  expect(invocation).toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
}

/**
 * Compliance: an interrupted language folds the run's terminal status to interrupted when no language
 * failed, taking precedence over passing languages that ran alongside it.
 */
export async function assertTestRunnerFoldsInterruptedTerminalStatus(): Promise<void> {
  const invocation = await foldRegistryInvocation({
    languages: [
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.PASSED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED),
    ],
  });
  expect(invocation).toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED });
}

/**
 * Compliance: a registry whose languages are all non-streaming or gated out contributes no terminal
 * status, so the test runner gates the run out rather than reporting a passing empty fold.
 */
export async function assertTestRunnerGatesOutWhenNoLanguageStreams(): Promise<void> {
  const invocation = await foldRegistryInvocation({
    languages: [nonStreamingDescriptor(), gatedOutDescriptor()],
  });
  expect(invocation).toEqual({ invoked: false });
}

/**
 * Compliance: two distinct failing cases whose module id and test name straddle a separator
 * differently — collapsing onto one key under a naive `moduleId + separator + testName` join — both
 * record as findings, because the finding idempotency key encodes the pair without collision.
 */
export async function assertExecutorRecordsSeparatorStraddlingFindingsDistinctly(): Promise<void> {
  const harness = createExecutorHarness();
  const [first, second] = sampleJournalReporterValue(
    JOURNAL_REPORTER_TEST_GENERATOR.collidingFindingPair(),
  );
  const controlled = createControlledRunner({
    scopeUnits: [],
    findings: [first, second],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  });

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: harness.recorder,
  });

  expect(result.executed).toBe(true);
  if (!result.executed) return;
  const report = await renderRunReport(harness, result.run.runToken);
  expect(eventsOfType(report.events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(2);
}

/**
 * Compliance: when the runner fails after the run opens, the executor finishes the opened run with an
 * interrupted terminal status before the failure surfaces, so it leaves no spx-driven run unsealed.
 */
export async function assertExecutorSealsRunWhenRunnerFails(): Promise<void> {
  const harness = createExecutorHarness();
  const failure = new Error(sampleJournalReporterValue(arbitraryDomainLiteral()));
  const runner: JournalStreamingRunner = {
    runTestsStreaming: () => Promise.reject(failure),
  };
  let opened: RunLocator | undefined;
  const recorder: ExecutorRecorderOperations = {
    open: async (request) => {
      opened = await harness.recorder.open(request);
      return opened;
    },
    appendScope: (run, unit) => harness.recorder.appendScope(run, unit),
    appendFinding: (run, finding) => harness.recorder.appendFinding(run, finding),
    finish: (run, status) => harness.recorder.finish(run, status),
  };

  await expect(
    executeVerificationRun(harness.request, { resolveRunner: () => runner, recorder }),
  ).rejects.toBe(failure);

  expect(opened).toBeDefined();
  if (opened === undefined) return;
  const report = await renderRunReport(harness, opened.runToken);
  expect(report.sealed).toBe(true);
  expect(report.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
}

/**
 * Compliance: the interrupted seal is best-effort — when the runner fails after the run opens and the
 * recorder's finish also fails, the original runner failure surfaces rather than the finish failure,
 * so a degraded recorder never masks the runner error the caller needs.
 */
export async function assertExecutorSurfacesRunnerFailureWhenSealAlsoFails(): Promise<void> {
  const harness = createExecutorHarness();
  const runnerFailure = new Error(sampleJournalReporterValue(arbitraryDomainLiteral()));
  const finishFailure = new Error(sampleJournalReporterValue(arbitraryDomainLiteral()));
  const runner: JournalStreamingRunner = {
    runTestsStreaming: () => Promise.reject(runnerFailure),
  };
  const recorder: ExecutorRecorderOperations = {
    open: (request) => harness.recorder.open(request),
    appendScope: (run, unit) => harness.recorder.appendScope(run, unit),
    appendFinding: (run, finding) => harness.recorder.appendFinding(run, finding),
    finish: () => Promise.reject(finishFailure),
  };

  await expect(
    executeVerificationRun(harness.request, { resolveRunner: () => runner, recorder }),
  ).rejects.toBe(runnerFailure);
}
