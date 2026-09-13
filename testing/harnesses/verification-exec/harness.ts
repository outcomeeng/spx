/**
 * Test harness for the spx-driven verification executor
 * (`spx/34-verification.enabler/43-execute.enabler`).
 *
 * The executor is driven over the real verify recorder wired to an in-memory state store, so its
 * evidence flows through the same recorder lifecycle production uses. The runner is a controlled
 * `JournalStreamingRunner` double that streams configured scope units and findings into the injected
 * sink and yields a configured invocation — no real Vitest run at `l1`. Controlled scope units,
 * findings, and terminal statuses come from the journal-reporter generators, which own the
 * journal-streaming evidence domain. Every function here returns observations; the linked tests own
 * every predicate.
 */
import {
  executeVerificationRun,
  type ExecutorRecorderOperations,
  type ExecutorRunRequest,
  type ExecutorRunResult,
  type JournalStreamingRunner,
  resolveTestRunner,
  resolveVerificationRunner,
} from "@/commands/verification-exec";
import { createRecorderOperations } from "@/commands/verification-exec/recorder-operations";
import { verifyRenderCommand, type VerifyRenderReport, verifyStatusCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  driveModeOf,
  type RunLocator,
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_TYPE,
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

/** The configured output of a controlled runner: the scope and findings it streams and the invocation it yields. */
export interface ControlledRunOutcome {
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

/** How many times each recorder lifecycle operation ran. */
export interface RecorderCallCounts {
  readonly open: number;
  readonly scope: number;
  readonly finding: number;
  readonly finish: number;
}

/** A recorder that counts each lifecycle call while delegating to a real recorder underneath. */
interface RecorderSpy {
  readonly recorder: ExecutorRecorderOperations;
  counts(): RecorderCallCounts;
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
    counts: () => ({ open, scope, finding, finish }),
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

async function renderRunReport(harness: ExecutorHarness, runToken: string): Promise<VerifyRenderReport> {
  return parseRenderReport(
    (await verifyRenderCommand(
      verifyRenderOptions(harness.scenario, runToken),
      verifyDeps(harness.scenario, harness.fs),
    )).output,
  );
}

/** The events of one journal type within a rendered run, a projection the linked test asserts over. */
export function eventsOfType(events: readonly JournalEvent[], type: string): readonly JournalEvent[] {
  return events.filter((event) => event.type === type);
}

/** An outcome whose runner streams one inspected unit and reports a passing terminal status. */
export function passingScopeOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED },
  };
}

/** An outcome whose runner streams one inspected unit and one failing case and reports a failed terminal status. */
export function failingMixedOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  };
}

/** A gated-out outcome: detection gated the runner out, so it streams no scope or finding and reports no terminal status. */
export function gatedOutOutcome(): ControlledRunOutcome {
  return { scopeUnits: [], findings: [], invocation: { invoked: false } };
}

/** An outcome whose product directory supplied no runner: nothing streamed, and the searched directory is named. */
export function unresolvedRunnerOutcome(productDir: string): ControlledRunOutcome {
  return { scopeUnits: [], findings: [], invocation: { invoked: false, unresolvedRunner: { productDir } } };
}

/** An outcome whose runner reports an interrupted terminal status after streaming one inspected unit. */
export function interruptedRunnerOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
    findings: [],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED },
  };
}

/** An outcome whose single failing case carries no error message — the reporter's message-absent fallback. */
export function findingWithoutErrorMessagesOutcome(): ControlledRunOutcome {
  return {
    scopeUnits: [],
    findings: [sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.findingWithoutErrorMessages())],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  };
}

/** An outcome whose two failing cases straddle the module/case separator differently and must record distinctly. */
export function collidingFindingsOutcome(): ControlledRunOutcome {
  const [first, second] = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.collidingFindingPair());
  return {
    scopeUnits: [],
    findings: [first, second],
    invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
  };
}

/** What one executor run over a controlled runner and the real recorder exposes for inspection. */
export interface ExecutorRunObservation {
  /** The request the executor was asked to run. */
  readonly request: ExecutorRunRequest;
  /** The outcome the controlled runner was configured to stream. */
  readonly outcome: ControlledRunOutcome;
  /** The executor's result. */
  readonly result: ExecutorRunResult;
  /** The request the controlled runner received, or `undefined` when it never ran. */
  readonly drivenRequest: JournalRunRequest | undefined;
  /** How many times each recorder lifecycle operation ran. */
  readonly recorderCalls: RecorderCallCounts;
  /** The run rendered from the recorder after the executor returned, when a run was opened. */
  readonly report: VerifyRenderReport | undefined;
}

/**
 * Drives the executor over a controlled runner streaming the given outcome and the real recorder,
 * then renders the recorded run; returns the result, the runner's received request, the recorder
 * call counts, and the rendered run for the test to judge.
 */
export async function observeExecutorRun(outcome: ControlledRunOutcome): Promise<ExecutorRunObservation> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(outcome);
  const spy = spyOnRecorder(harness.recorder);

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => controlled.runner,
    recorder: spy.recorder,
  });
  const report = result.executed ? await renderRunReport(harness, result.run.runToken) : undefined;
  return {
    request: harness.request,
    outcome,
    result,
    drivenRequest: controlled.request(),
    recorderCalls: spy.counts(),
    report,
  };
}

/** What the recorder projected for the run before and after the executor sealed it. */
export interface DriveModeObservation {
  /** The drive mode the status projection reported while the run was still unsealed. */
  readonly unsealedDriveMode: string | undefined;
  /** The next actions the status projection advertised while the run was still unsealed. */
  readonly unsealedNextActions: readonly string[] | undefined;
  /** The drive mode recorded in the sealed run's events. */
  readonly sealedDriveMode: string | undefined;
}

/**
 * Drives the executor over a controlled runner and, at the moment the executor finishes the run,
 * reads the recorder's status projection of the still-unsealed run; returns that projection
 * alongside the drive mode the sealed run's events carry.
 */
export async function observeDriveModeAroundSeal(outcome: ControlledRunOutcome): Promise<DriveModeObservation> {
  const harness = createExecutorHarness();
  const controlled = createControlledRunner(outcome);

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
  const sealedDriveMode = result.executed
    ? driveModeOf((await renderRunReport(harness, result.run.runToken)).events)
    : undefined;
  return { unsealedDriveMode, unsealedNextActions, sealedDriveMode };
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
export function streamingDescriptorYielding(status: JournalRunTerminalStatus): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(async () => ({ invoked: true, terminalStatus: status }));
}

/** A descriptor whose detection gates its streaming run out, contributing no terminal status to the fold. */
export function gatedOutDescriptor(): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(async () => ({ invoked: false }));
}

/** A descriptor that exposes no journal-streaming run at all, so the resolver skips it. */
export function nonStreamingDescriptor(): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(undefined);
}

/** A present-language descriptor whose product directory supplies no runner, reporting the directory it searched. */
export function unresolvedRunnerDescriptor(productDir: string): TestingLanguageDescriptor {
  return createControlledLanguageDescriptor(async () => ({ invoked: false, unresolvedRunner: { productDir } }));
}

/** Drive the test runner over a controlled registry and return the folded invocation. */
export async function observeTestRunnerFold(
  languages: readonly TestingLanguageDescriptor[],
): Promise<JournalRunInvocation> {
  const registry: TestingRegistry = { languages };
  return resolveTestRunner(registry).runTestsStreaming(
    sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
    { sink: { appendScope: () => undefined, appendFinding: () => undefined } },
  );
}

/** What resolving runners through the verification-type registry and driving one registry language exposes. */
export interface RegistryResolutionObservation {
  /** Whether the `test` type resolved to a runner. */
  readonly testRunnerResolved: boolean;
  /** Whether the agentic `audit` type resolved to a runner. */
  readonly auditRunnerResolved: boolean;
  /** The unit the controlled registry language streamed. */
  readonly streamedUnit: TestScopeUnit;
  /** The units the sink received while the test runner drove the controlled registry. */
  readonly receivedUnits: readonly TestScopeUnit[];
  /** The invocation the test runner folded over the controlled registry. */
  readonly invocation: JournalRunInvocation;
}

/**
 * Resolves runners for the `test` and `audit` types through the verification-type registry, then
 * drives the `test` runner over a one-language controlled registry whose language streams one unit.
 */
export async function observeRegistryResolution(): Promise<RegistryResolutionObservation> {
  const streamedUnit = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const controlledDescriptor = createControlledLanguageDescriptor(
    async (_request: JournalRunRequest, deps: JournalStreamRunDependencies): Promise<JournalRunInvocation> => {
      await deps.sink.appendScope(streamedUnit);
      return { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED };
    },
  );
  const registry: TestingRegistry = { languages: [controlledDescriptor] };

  const receivedUnits: TestScopeUnit[] = [];
  const invocation = await resolveTestRunner(registry).runTestsStreaming(
    sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
    { sink: { appendScope: (unit) => void receivedUnits.push(unit), appendFinding: () => undefined } },
  );

  return {
    testRunnerResolved: resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.TEST) !== undefined,
    auditRunnerResolved: resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.AUDIT) !== undefined,
    streamedUnit,
    receivedUnits,
    invocation,
  };
}

/** What executing a verification type that resolves to no runner exposes. */
export interface UnsupportedTypeObservation {
  readonly result: ExecutorRunResult;
  readonly recorderCalls: RecorderCallCounts;
}

/** Drives the executor with a resolver that knows no runner for the request's type. */
export async function observeUnsupportedTypeExecution(): Promise<UnsupportedTypeObservation> {
  const harness = createExecutorHarness();
  const spy = spyOnRecorder(harness.recorder);
  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => undefined,
    recorder: spy.recorder,
  });
  return { result, recorderCalls: spy.counts() };
}

/** Deferred recorder lifecycle operations aimed at inputs the recorder rejects, for the test to await. */
export interface RecorderFailureThunks {
  /** Opens a run over a scope the recorder cannot canonicalize. */
  readonly openMalformedScope: () => Promise<RunLocator>;
  /** Appends a scope unit to a run token the store never opened. */
  readonly appendScopeToMissingRun: () => Promise<void>;
  /** Appends a finding to a run token the store never opened. */
  readonly appendFindingToMissingRun: () => Promise<void>;
  /** Finishes a run token the store never opened. */
  readonly finishMissingRun: () => Promise<void>;
}

/** Builds the real recorder over an in-memory store and returns thunks aimed at inputs it rejects. */
export async function observeRecorderLifecycleFailures(): Promise<RecorderFailureThunks> {
  const harness = createExecutorHarness();
  const scopeUnit = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const finding = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.finding());
  const opened = await harness.recorder.open(harness.request);
  const missingRun: RunLocator = { ...opened, runToken: arbitraryDomainLiteralValue() };
  return {
    openMalformedScope: () => harness.recorder.open({ ...harness.request, scope: arbitraryDomainLiteralValue() }),
    appendScopeToMissingRun: () => harness.recorder.appendScope(missingRun, scopeUnit),
    appendFindingToMissingRun: () => harness.recorder.appendFinding(missingRun, finding),
    finishMissingRun: () => harness.recorder.finish(missingRun, JOURNAL_RUN_STATE_STATUS.INTERRUPTED),
  };
}

/** What a runner that fails after the run opened leaves behind. */
export interface RunnerFailureObservation {
  /** The failure the runner raised. */
  readonly failure: Error;
  /** What the executor rejected with. */
  readonly rejection: unknown;
  /** The run the recorder opened before the runner failed, or `undefined` when none opened. */
  readonly opened: RunLocator | undefined;
  /** The opened run rendered after the executor rejected, when one opened. */
  readonly report: VerifyRenderReport | undefined;
}

/** Drives the executor over a runner that rejects after the run opens and renders whatever run it left. */
export async function observeRunnerFailure(): Promise<RunnerFailureObservation> {
  const harness = createExecutorHarness();
  const failure = new Error(arbitraryDomainLiteralValue());
  const runner: JournalStreamingRunner = { runTestsStreaming: () => Promise.reject(failure) };
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

  let rejection: unknown;
  try {
    await executeVerificationRun(harness.request, { resolveRunner: () => runner, recorder });
  } catch (error: unknown) {
    rejection = error;
  }
  const report = opened === undefined ? undefined : await renderRunReport(harness, opened.runToken);
  return { failure, rejection, opened, report };
}

/** What a runner failure combined with a failing seal leaves the caller with. */
export interface RunnerAndSealFailureObservation {
  readonly runnerFailure: Error;
  readonly finishFailure: Error;
  /** What the executor rejected with. */
  readonly rejection: unknown;
}

/** Drives the executor over a rejecting runner and a recorder whose finish also rejects. */
export async function observeRunnerFailureWithSealFailure(): Promise<RunnerAndSealFailureObservation> {
  const harness = createExecutorHarness();
  const runnerFailure = new Error(arbitraryDomainLiteralValue());
  const finishFailure = new Error(arbitraryDomainLiteralValue());
  const runner: JournalStreamingRunner = { runTestsStreaming: () => Promise.reject(runnerFailure) };
  const recorder: ExecutorRecorderOperations = {
    open: (request) => harness.recorder.open(request),
    appendScope: (run, unit) => harness.recorder.appendScope(run, unit),
    appendFinding: (run, finding) => harness.recorder.appendFinding(run, finding),
    finish: () => Promise.reject(finishFailure),
  };

  let rejection: unknown;
  try {
    await executeVerificationRun(harness.request, { resolveRunner: () => runner, recorder });
  } catch (error: unknown) {
    rejection = error;
  }
  return { runnerFailure, finishFailure, rejection };
}
