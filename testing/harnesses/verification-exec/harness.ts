/**
 * Test harness for the spx-driven verification executor
 *
 * The executor is driven over the real verify recorder wired to an in-memory state store, so its
 * evidence flows through the same recorder lifecycle production uses. The runner is a controlled
 * `JournalStreamingRunner` double that streams configured scope units and findings into the injected
 * sink and yields a configured invocation — no real Vitest run at `l1`. The linked test composes
 * each outcome it drives from the journal-reporter generators and the source-owned terminal
 * vocabulary; every function here returns observations, and the linked tests own every predicate.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

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
  type TestRunEvidenceSink,
  type TestScopeUnit,
} from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { type GeneratedAppendMix, JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
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
  const runRequest = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest());
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
  return sampleGeneratedValue(arbitraryDomainLiteral());
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
    sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
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
  const streamedUnit = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const controlledDescriptor = createControlledLanguageDescriptor(
    async (_request: JournalRunRequest, deps: JournalStreamRunDependencies): Promise<JournalRunInvocation> => {
      await deps.sink.appendScope(streamedUnit);
      return { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED };
    },
  );
  const registry: TestingRegistry = { languages: [controlledDescriptor] };

  const receivedUnits: TestScopeUnit[] = [];
  const invocation = await resolveTestRunner(registry).runTestsStreaming(
    sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()),
    {
      sink: {
        appendScope: (unit) => {
          receivedUnits.push(unit);
        },
        appendFinding: () => undefined,
      },
    },
  );

  return {
    testRunnerResolved: resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.TEST) !== undefined,
    auditRunnerResolved: resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.AUDIT) !== undefined,
    streamedUnit,
    receivedUnits,
    invocation,
  };
}

/** What driving the `test` type's production runner over a product that declares a language but installs no runner exposes. */
export interface ProductionRegistryDriveObservation {
  /** The product root the runner was asked to run over. */
  readonly productDir: string;
  /** The invocation the production runner folded over the registry's real languages. */
  readonly invocation: JournalRunInvocation | undefined;
}

const EMPTY_TYPESCRIPT_MARKER = "{}";

/**
 * Resolves the `test` type through the production verification-type registry — no registry
 * injected — and drives it over a temp product carrying the TypeScript marker and no runner, so the
 * registry's own TypeScript language is the one that reports.
 */
export async function observeProductionRegistryDrive(): Promise<ProductionRegistryDriveObservation> {
  let observation: ProductionRegistryDriveObservation | undefined;
  await withTestingTempProductDir(async (productDir) => {
    await writeFile(join(productDir, TYPESCRIPT_MARKER), EMPTY_TYPESCRIPT_MARKER);
    const runner = resolveVerificationRunner(VERIFY_VERIFICATION_TYPE.TEST);
    const invocation = runner === undefined ? undefined : await runner.runTestsStreaming(
      { ...sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()), productDir },
      { sink: { appendScope: () => undefined, appendFinding: () => undefined } },
    );
    observation = { productDir, invocation };
  });
  if (observation === undefined) throw new Error("executor harness produced no production registry observation");
  return observation;
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
  const scopeUnit = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit());
  const finding = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.finding());
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

/** One append a runner fired or a recorder received, tagged by evidence kind so cross-kind order is observable. */
export type ObservedAppend =
  | { readonly kind: "scope"; readonly unit: TestScopeUnit }
  | { readonly kind: "finding"; readonly finding: TestFinding };

/** The appends of a mix interleaved by kind — scope, finding, scope, finding, … — then the longer kind's remainder. */
function interleaveAppends(mix: GeneratedAppendMix): readonly ObservedAppend[] {
  const fired: ObservedAppend[] = [];
  for (let i = 0; i < Math.max(mix.units.length, mix.findings.length); i += 1) {
    if (i < mix.units.length) fired.push({ kind: "scope", unit: mix.units[i] });
    if (i < mix.findings.length) fired.push({ kind: "finding", finding: mix.findings[i] });
  }
  return fired;
}

/** Fires one append against the sink for the observed append's kind. */
function fireAppend(sink: TestRunEvidenceSink, append: ObservedAppend): Promise<void> {
  return append.kind === "scope"
    ? Promise.resolve(sink.appendScope(append.unit))
    : Promise.resolve(sink.appendFinding(append.finding));
}

/**
 * A recorder that tags and orders every append it receives and tracks how many are in flight at
 * once; every append is forwarded, and `admit` decides only which ones the received order records.
 */
interface ObservingRecorder {
  readonly recorder: ExecutorRecorderOperations;
  readonly received: readonly ObservedAppend[];
  peakInFlight(): number;
}

function observeRecorderAppends(
  base: ExecutorRecorderOperations,
  admit: (append: ObservedAppend) => boolean,
): ObservingRecorder {
  const received: ObservedAppend[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  const observe = async (append: ObservedAppend, forward: () => Promise<void>): Promise<void> => {
    if (admit(append)) received.push(append);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      await forward();
    } finally {
      inFlight -= 1;
    }
  };
  return {
    recorder: {
      ...base,
      appendScope: (run, unit) => observe({ kind: "scope", unit }, () => base.appendScope(run, unit)),
      appendFinding: (run, finding) => observe({ kind: "finding", finding }, () => base.appendFinding(run, finding)),
    },
    received,
    peakInFlight: () => peakInFlight,
  };
}

/** What a run whose runner fired every append at once, across both kinds, left in the recorder. */
export interface OverlappingAppendsObservation {
  readonly result: ExecutorRunResult;
  /** The appends the runner fired, in the order it fired them. */
  readonly fired: readonly ObservedAppend[];
  /** The appends the recorder received, in the order their appends began. */
  readonly received: readonly ObservedAppend[];
  /** The most recorder appends in flight at any one moment. */
  readonly peakInFlight: number;
  /** The run rendered after the executor finished it, when one opened. */
  readonly report: VerifyRenderReport | undefined;
}

/**
 * Drives the executor over a runner that fires every scope and finding append at once without
 * awaiting any of them — the overlap a runner reporting from parallel workers produces — against the
 * real recorder, observing how many recorder appends overlapped and in what order they began. The
 * runner reports `failed`, the one terminal status the `test` type admits over recorded findings.
 */
export async function observeOverlappingAppends(mix: GeneratedAppendMix): Promise<OverlappingAppendsObservation> {
  const harness = createExecutorHarness();
  const fired = interleaveAppends(mix);
  const observing = observeRecorderAppends(harness.recorder, () => true);
  const runner: JournalStreamingRunner = {
    async runTestsStreaming(_request, deps) {
      await Promise.all(fired.map(async (append) => fireAppend(deps.sink, append)));
      return { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED };
    },
  };

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => runner,
    recorder: observing.recorder,
  });
  const report = result.executed ? await renderRunReport(harness, result.run.runToken) : undefined;
  return { result, fired, received: observing.received, peakInFlight: observing.peakInFlight(), report };
}

/** What a run whose first append the recorder rejected left for the appends fired after it. */
export interface RejectedAppendObservation {
  /** The failure the recorder raised for the first append. */
  readonly failure: Error;
  /** The appends the runner fired, in the order it fired them; the first is the rejected one. */
  readonly fired: readonly ObservedAppend[];
  /** What each append rejected with, in fired order — `undefined` where it fulfilled. */
  readonly rejections: readonly unknown[];
  /** The appends the recorder recorded, in the order their appends began. */
  readonly received: readonly ObservedAppend[];
  /** The run rendered after the executor finished it, when one opened. */
  readonly report: VerifyRenderReport | undefined;
}

/**
 * Drives the executor over a runner that fires every scope and finding append at once against a
 * recorder that rejects the first append and records the rest, observing how each append settled
 * and which appends the recorder went on to record.
 */
export async function observeRejectedAppendAmongQueued(mix: GeneratedAppendMix): Promise<RejectedAppendObservation> {
  const harness = createExecutorHarness();
  const failure = new Error(arbitraryDomainLiteralValue());
  const fired = interleaveAppends(mix);
  // The interleaving opens with the first scope unit, so it is the append the recorder refuses.
  const [rejectedUnit] = mix.units;
  const rejecting: ExecutorRecorderOperations = {
    ...harness.recorder,
    appendScope: (run, unit) => {
      if (unit === rejectedUnit) throw failure;
      return harness.recorder.appendScope(run, unit);
    },
  };
  const observing = observeRecorderAppends(
    rejecting,
    (append) => !(append.kind === "scope" && append.unit === rejectedUnit),
  );
  let rejections: readonly unknown[] = [];
  const runner: JournalStreamingRunner = {
    async runTestsStreaming(_request, deps) {
      const settled = await Promise.allSettled(fired.map(async (append) => fireAppend(deps.sink, append)));
      rejections = settled.map((outcome) => (outcome.status === "rejected" ? outcome.reason : undefined));
      return { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED };
    },
  };

  const result = await executeVerificationRun(harness.request, {
    resolveRunner: () => runner,
    recorder: observing.recorder,
  });
  const report = result.executed ? await renderRunReport(harness, result.run.runToken) : undefined;
  return { failure, fired, rejections, received: observing.received, report };
}
