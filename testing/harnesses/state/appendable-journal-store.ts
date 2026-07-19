import { dirname, join } from "node:path";

import { execa } from "execa";

import {
  createJournal,
  JOURNAL_SEQ_BASE,
  type JournalEvent,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalCreationMarkerPath,
  appendableJournalSealMarkerPath,
  appendableJournalSequenceRecordPath,
  createAppendableJournalStore,
} from "@/lib/appendable-journal-store";
import { serializeJsonlRecord, type StateStoreFileSystem } from "@/lib/state-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalEventInputs,
  arbitraryJournalIdentity,
  arbitraryJournalPairInput,
  arbitraryMalformedJournalLines,
  journalEventFromInput,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";
import {
  createDelegatingStateStoreFileSystem,
  createInMemoryStateStoreFileSystem,
} from "@testing/harnesses/state/in-memory-file-system";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH = [
  "node_modules",
  ".bin",
  "tsx",
] as const;
const TEST_TYPESCRIPT_EXECUTION_ARGS = [
  "--input-type=module",
  "--eval",
] as const;
const INTERRUPTION_TEMP_DIR_PREFIX = "spx-appendable-journal-interruption-";
export const APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE = {
  PRE_PUBLICATION: 73,
  POST_PUBLICATION: 74,
} as const;
const INTERRUPTION_MODE_ENV = "SPX_JOURNAL_INTERRUPTION_MODE";
const INTERRUPTION_IDENTITY_ENV = "SPX_JOURNAL_INTERRUPTION_IDENTITY";
const INTERRUPTION_INPUT_ENV = "SPX_JOURNAL_INTERRUPTION_INPUT";
const INTERRUPTION_RUN_FILE_ENV = "SPX_JOURNAL_INTERRUPTION_RUN_FILE";
const PRE_PUBLICATION_MODE = "pre-publication";
const POST_PUBLICATION_MODE = "post-publication";
export const APPENDABLE_JOURNAL_INTERRUPTION_ERROR = {
  AGGREGATE_SEAL: "injected seal interruption",
  SEALING_BARRIER: "injected sealing barrier interruption",
} as const;

export interface AppendableJournalSequenceObservation {
  readonly appended: readonly JournalEvent[];
  readonly replay: readonly JournalEvent[];
}

export async function observeAppendableJournalSequence(
  inputs: readonly JournalEventInput[],
  identity: JournalIdentity,
): Promise<AppendableJournalSequenceObservation> {
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
  const appended: JournalEvent[] = [];
  for (const input of inputs) appended.push(await journal.append(input));
  return { appended, replay: await createAppendableJournalStore({ runFilePath, fs }).readAll() };
}

export interface OverlappingAppendObservation {
  readonly fulfilledCount: number;
  readonly rejectedMessages: readonly (string | undefined)[];
  readonly replay: readonly JournalEvent[];
}

export async function observeOverlappingAppendSequence(
  leftInput: JournalEventInput,
  rightInput: JournalEventInput,
  identity: JournalIdentity,
): Promise<OverlappingAppendObservation> {
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const leftJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
  const rightJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
  const outcomes = await Promise.allSettled([
    leftJournal.append(leftInput),
    rightJournal.append(rightInput),
  ]);
  return {
    fulfilledCount: outcomes.filter(isFulfilledOutcome).length,
    rejectedMessages: outcomes.filter(isRejectedOutcome).map(rejectedOutcomeMessage),
    replay: await createAppendableJournalStore({ runFilePath, fs }).readAll(),
  };
}

export interface SequenceRecordReadReuseObservation {
  readonly inputCount: number;
  readonly listCountAfterAppends: number;
  readonly listCountAfterCurrentReplay: number;
  readonly readCountAfterCurrentReplay: number;
  readonly listCountAfterReopenedReplays: number;
  readonly readCountAfterReopenedReplays: number;
}

export async function observeSequenceRecordReadReuse(): Promise<SequenceRecordReadReuseObservation> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const inputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const sequenceRecordPaths = new Set<string>();
  let sequenceRecordReadCount = 0;
  let sequenceRecordListCount = 0;
  const fs = createDelegatingStateStoreFileSystem(base, {
    readFile: async (path, encoding) => {
      if (sequenceRecordPaths.has(path)) sequenceRecordReadCount += 1;
      return base.readFile(path, encoding);
    },
    readdir: async (path, options) => {
      sequenceRecordListCount += 1;
      return base.readdir(path, options);
    },
  });
  const store = createAppendableJournalStore({ runFilePath, fs });
  const journal = createJournal(store, identity);

  for (const input of inputs) {
    const event = await journal.append(input);
    sequenceRecordPaths.add(appendableJournalSequenceRecordPath(runFilePath, event.seq));
  }
  const listCountAfterAppends = sequenceRecordListCount;
  await store.readAll();
  const listCountAfterCurrentReplay = sequenceRecordListCount;
  const readCountAfterCurrentReplay = sequenceRecordReadCount;

  const reopened = createAppendableJournalStore({ runFilePath, fs });
  await reopened.readAll();
  await reopened.readAll();
  return {
    inputCount: inputs.length,
    listCountAfterAppends,
    listCountAfterCurrentReplay,
    readCountAfterCurrentReplay,
    listCountAfterReopenedReplays: sequenceRecordListCount,
    readCountAfterReopenedReplays: sequenceRecordReadCount,
  };
}

export interface AppendableJournalCreationMarkerObservation {
  readonly openedBirthtimeMs: number;
  readonly creationMarkerBirthtimeMs: number;
  readonly aggregateBirthtimeMs: number;
}

export async function observeAppendableJournalCreationMarker(): Promise<AppendableJournalCreationMarkerObservation> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  await fs.mkdir(dirname(runFilePath), { recursive: true });
  await fs.writeFile(runFilePath, APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);
  const openedStats = await fs.lstat(runFilePath);
  const journal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);

  await journal.append(input);
  await journal.seal();

  const creationStats = await fs.lstat(appendableJournalCreationMarkerPath(runFilePath));
  const aggregateStats = await fs.lstat(runFilePath);
  return {
    openedBirthtimeMs: openedStats.birthtimeMs,
    creationMarkerBirthtimeMs: creationStats.birthtimeMs,
    aggregateBirthtimeMs: aggregateStats.birthtimeMs,
  };
}

export interface ConsumedSequenceObservation {
  readonly appendError: string | undefined;
  readonly event: JournalEvent;
  readonly replay: readonly JournalEvent[];
}

export async function observeConsumedSequenceRejection(): Promise<ConsumedSequenceObservation> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const store = createAppendableJournalStore({ runFilePath, fs });
  const event = await createJournal(store, identity).append(input);
  return {
    appendError: rejectedOutcomeMessage(await settle(store.append(event))),
    event,
    replay: await store.readAll(),
  };
}

export interface PersistedSealObservation {
  readonly appendError: string | undefined;
  readonly sealed: boolean;
}

export async function observePersistedSeal(): Promise<PersistedSealObservation> {
  const { firstInput, secondInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
  await journal.append(firstInput);
  await journal.seal();
  const reopened = createAppendableJournalStore({ runFilePath, fs });
  return {
    sealed: await reopened.isSealed(),
    appendError: rejectedOutcomeMessage(await settle(createJournal(reopened, identity).append(secondInput))),
  };
}

export interface MalformedReplayObservation {
  readonly event: JournalEvent;
  readonly replay: readonly JournalEvent[];
}

export interface MalformedJournalReplayObservation {
  readonly nonconformant: MalformedReplayObservation;
  readonly unparsable: MalformedReplayObservation;
}

export async function observeMalformedJournalReplay(): Promise<MalformedJournalReplayObservation> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const [nonconformantLine, unparsableLine] = sampleAgentRunJournalValue(arbitraryMalformedJournalLines());
  return {
    nonconformant: await observeMalformedLine(identity, input, nonconformantLine),
    unparsable: await observeMalformedLine(identity, input, unparsableLine),
  };
}

async function observeMalformedLine(
  identity: JournalIdentity,
  input: JournalEventInput,
  malformedLine: string,
): Promise<MalformedReplayObservation> {
  const fs = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const event = journalEventFromInput(input, identity, JOURNAL_SEQ_BASE);
  await fs.mkdir(dirname(runFilePath), { recursive: true });
  await fs.writeFile(runFilePath, `${serializeJsonlRecord({ ...event })}${malformedLine}`);
  await fs.writeFile(
    appendableJournalSealMarkerPath(runFilePath),
    APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  );
  const store = createAppendableJournalStore({ runFilePath, fs });
  return { event, replay: await store.readAll() };
}

export interface PreparedSealingRace {
  readonly base: StateStoreFileSystem;
  readonly runFilePath: string;
  readonly first: JournalEvent;
  readonly appendOutcomePromise: Promise<PromiseSettledResult<JournalEvent>>;
  releaseAppendPublication(): void;
}

export interface SealingRaceBranchObservation {
  readonly first: JournalEvent;
  readonly appended: JournalEvent | undefined;
  readonly appendError: string | undefined;
  readonly hydratedReplay: readonly JournalEvent[];
}

export interface AppendableJournalSealingRaceObservation {
  readonly sealingBarrier: SealingRaceBranchObservation;
  readonly appendPublication: SealingRaceBranchObservation;
}

export interface OverlappingSealObservation {
  readonly first: JournalEvent;
  readonly second: JournalEvent;
  readonly fulfilledCount: number;
  readonly replayAfterSecondSeal: readonly JournalEvent[];
  readonly replayAfterFirstSeal: readonly JournalEvent[];
}

export async function observeAppendableJournalSealingRace(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<AppendableJournalSealingRaceObservation> {
  return {
    sealingBarrier: await observeSealingBarrierWinner(identity, firstInput, secondInput),
    appendPublication: await observeAppendPublicationWinner(identity, firstInput, secondInput),
  };
}

interface PrePublicationInterruptionResult {
  readonly exitCode: number | undefined;
  readonly appendedSequence: number;
  readonly replay: readonly JournalEvent[];
}

interface PostPublicationInterruptionResult {
  readonly exitCode: number | undefined;
  readonly replay: readonly JournalEvent[];
  readonly nextSequence: number;
}

interface AggregateSealInterruptionResult {
  readonly sealError: string | undefined;
  readonly sealedAfterInterruption: boolean;
  readonly replayAfterInterruption: readonly JournalEvent[];
  readonly hydratedReplay: readonly JournalEvent[];
  readonly unsealedAggregateReplay: readonly JournalEvent[];
}

interface StaleBarrierInterruptionResult {
  readonly sealError: string | undefined;
  readonly sealedAfterInterruption: boolean;
  readonly appendError: string | undefined;
  readonly hydratedReplay: readonly JournalEvent[];
}

interface AppendableJournalInterruptionResult {
  readonly prePublication: PrePublicationInterruptionResult;
  readonly postPublication: PostPublicationInterruptionResult;
  readonly aggregateSeal: AggregateSealInterruptionResult;
  readonly staleBarrier: StaleBarrierInterruptionResult;
}

export interface AppendableJournalInterruptionObservation {
  readonly identity: JournalIdentity;
  readonly firstInput: JournalEventInput;
  readonly nextInput: JournalEventInput;
  readonly actual: AppendableJournalInterruptionResult;
}

let interruptionObservationPromise: Promise<AppendableJournalInterruptionObservation> | undefined;

/** Exercise append and seal interruption boundaries and return observations plus fixture inputs. */
export function appendableJournalInterruptionObservation(): Promise<AppendableJournalInterruptionObservation> {
  interruptionObservationPromise ??= collectAppendableJournalInterruptionObservation();
  return interruptionObservationPromise;
}

async function collectAppendableJournalInterruptionObservation(): Promise<
  AppendableJournalInterruptionObservation
> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const firstInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const nextInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const prePublication = await observePrePublicationInterruption(identity, firstInput);
  const postPublication = await observePostPublicationInterruption(identity, firstInput, nextInput);
  const aggregateSeal = await observeInterruptedSealRecovery(identity, firstInput, nextInput);
  const staleBarrier = await observeStaleSealingBarrierRecovery(identity, firstInput, nextInput);
  return {
    identity,
    firstInput,
    nextInput,
    actual: { prePublication, postPublication, aggregateSeal, staleBarrier },
  };
}

async function observePrePublicationInterruption(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
): Promise<PrePublicationInterruptionResult> {
  return withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    const exitCode = await runInterruptedAppend(
      PRE_PUBLICATION_MODE,
      runFilePath,
      identity,
      firstInput,
    );
    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const appended = await createJournal(reopenedStore, identity).append(firstInput);
    return { exitCode, appendedSequence: appended.seq, replay: await reopenedStore.readAll() };
  });
}

async function observePostPublicationInterruption(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<PostPublicationInterruptionResult> {
  return withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    const exitCode = await runInterruptedAppend(
      POST_PUBLICATION_MODE,
      runFilePath,
      identity,
      firstInput,
    );
    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const reopened = createJournal(reopenedStore, identity);
    const replay = await reopenedStore.readAll();
    const next = await reopened.append(nextInput);
    return { exitCode, replay, nextSequence: next.seq };
  });
}

async function observeSealingBarrierWinner(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<SealingRaceBranchObservation> {
  const race = await prepareSealingRace(identity, firstInput, secondInput);
  await createJournal(
    createAppendableJournalStore({ runFilePath: race.runFilePath, fs: race.base }),
    identity,
  ).seal();
  race.releaseAppendPublication();
  const appendOutcome = await race.appendOutcomePromise;
  const hydratedReplay = await readHydratedReplay(race.base, race.runFilePath);
  return sealingRaceBranchObservation(race.first, appendOutcome, hydratedReplay);
}

async function observeAppendPublicationWinner(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<SealingRaceBranchObservation> {
  const race = await prepareSealingRace(identity, firstInput, secondInput, true);
  await createJournal(
    createAppendableJournalStore({ runFilePath: race.runFilePath, fs: race.base }),
    identity,
  ).seal();
  race.releaseAppendPublication();
  const appendOutcome = await race.appendOutcomePromise;
  return sealingRaceBranchObservation(
    race.first,
    appendOutcome,
    await readHydratedReplay(race.base, race.runFilePath),
  );
}

function sealingRaceBranchObservation(
  first: JournalEvent,
  appendOutcome: PromiseSettledResult<JournalEvent>,
  hydratedReplay: readonly JournalEvent[],
): SealingRaceBranchObservation {
  return {
    first,
    appended: isFulfilledOutcome(appendOutcome) ? appendOutcome.value : undefined,
    appendError: rejectedOutcomeMessage(appendOutcome),
    hydratedReplay,
  };
}

async function prepareSealingRace(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
  publishBeforePause = false,
): Promise<PreparedSealingRace> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const seedJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  );
  const first = await seedJournal.append(firstInput);
  const paused = createPausedPublicationFileSystem(base, publishBeforePause);
  const appendingJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: paused.fs }),
    identity,
  );
  const appendOutcomePromise = settle(appendingJournal.append(secondInput));
  await paused.linkStarted;
  return {
    base,
    runFilePath,
    first,
    appendOutcomePromise,
    releaseAppendPublication: paused.releaseLink,
  };
}

export async function observeOverlappingSeals(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<OverlappingSealObservation> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(createAppendableJournalStore({ runFilePath, fs: base }), identity);
  const first = await journal.append(firstInput);
  const second = await journal.append(secondInput);
  const paused = createPausedAggregateRenameFileSystem(base, runFilePath);
  const firstSeal = settle(createAppendableJournalStore({ runFilePath, fs: paused.fs }).seal());
  await paused.renameStarted;
  const secondSeal = settle(createAppendableJournalStore({ runFilePath, fs: base }).seal());
  const secondOutcome = await secondSeal;
  const replayAfterSecondSeal = await readHydratedReplay(base, runFilePath);
  paused.releaseRename();
  const firstOutcome = await firstSeal;
  return {
    first,
    second,
    fulfilledCount: [firstOutcome, secondOutcome].filter(isFulfilledOutcome).length,
    replayAfterSecondSeal,
    replayAfterFirstSeal: await readHydratedReplay(base, runFilePath),
  };
}

async function observeInterruptedSealRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<AggregateSealInterruptionResult> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const interrupted = createInterruptedSealFileSystem(runFilePath, base);
  const journal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: interrupted }),
    identity,
  );
  const appended = [
    await journal.append(firstInput),
    await journal.append(nextInput),
  ];

  const sealOutcome = await settle(journal.seal());
  const reopenedStore = createAppendableJournalStore({ runFilePath, fs: base });
  const sealedAfterInterruption = await reopenedStore.isSealed();
  const replayAfterInterruption = await reopenedStore.readAll();

  await createJournal(reopenedStore, identity).seal();
  const aggregate = await base.readFile(runFilePath, "utf8");
  const hydrated = createInMemoryStateStoreFileSystem();
  await hydrated.mkdir(join(runFilePath, ".."), { recursive: true });
  await hydrated.writeFile(runFilePath, aggregate);
  await hydrated.writeFile(
    appendableJournalSealMarkerPath(runFilePath),
    APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  );
  const hydratedReplay = await createAppendableJournalStore({ runFilePath, fs: hydrated }).readAll();

  const unsealedAggregate = createInMemoryStateStoreFileSystem();
  await unsealedAggregate.mkdir(join(runFilePath, ".."), { recursive: true });
  await unsealedAggregate.writeFile(
    runFilePath,
    serializeJsonlRecord({ ...appended[0] }),
  );
  const unsealedAggregateReplay = await createAppendableJournalStore({
    runFilePath,
    fs: unsealedAggregate,
  }).readAll();
  return {
    sealError: rejectedOutcomeMessage(sealOutcome),
    sealedAfterInterruption,
    replayAfterInterruption,
    hydratedReplay,
    unsealedAggregateReplay,
  };
}

async function observeStaleSealingBarrierRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<StaleBarrierInterruptionResult> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  );
  await journal.append(firstInput);
  await journal.append(nextInput);
  const interrupted = createInterruptedSealingBarrierFileSystem(base);

  const sealOutcome = await settle(
    createJournal(
      createAppendableJournalStore({ runFilePath, fs: interrupted }),
      identity,
    ).seal(),
  );
  const sealedAfterInterruption = await createAppendableJournalStore({
    runFilePath,
    fs: base,
  }).isSealed();
  const appendOutcome = await settle(journal.append(firstInput));

  await journal.seal();
  return {
    sealError: rejectedOutcomeMessage(sealOutcome),
    sealedAfterInterruption,
    appendError: rejectedOutcomeMessage(appendOutcome),
    hydratedReplay: await readHydratedReplay(base, runFilePath),
  };
}

async function readHydratedReplay(
  source: StateStoreFileSystem,
  runFilePath: string,
): Promise<readonly JournalEvent[]> {
  const hydrated = createInMemoryStateStoreFileSystem();
  await hydrated.mkdir(dirname(runFilePath), { recursive: true });
  await hydrated.writeFile(
    runFilePath,
    await source.readFile(runFilePath, "utf8"),
  );
  await hydrated.writeFile(
    appendableJournalSealMarkerPath(runFilePath),
    APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  );
  return createAppendableJournalStore({ runFilePath, fs: hydrated }).readAll();
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value): PromiseFulfilledResult<T> => ({ status: "fulfilled", value }),
    (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason }),
  );
}

interface PausedPublicationFileSystem {
  readonly fs: StateStoreFileSystem;
  readonly linkStarted: Promise<void>;
  releaseLink(): void;
}

function createPausedPublicationFileSystem(
  delegate: StateStoreFileSystem,
  publishBeforePause: boolean,
): PausedPublicationFileSystem {
  const started = deferred();
  const released = deferred();
  return {
    fs: createDelegatingStateStoreFileSystem(delegate, {
      link: async (existingPath, newPath) => {
        if (publishBeforePause) await delegate.link(existingPath, newPath);
        started.resolve();
        await released.promise;
        if (!publishBeforePause) await delegate.link(existingPath, newPath);
      },
    }),
    linkStarted: started.promise,
    releaseLink: released.resolve,
  };
}

interface PausedAggregateRenameFileSystem {
  readonly fs: StateStoreFileSystem;
  readonly renameStarted: Promise<void>;
  releaseRename(): void;
}

function createPausedAggregateRenameFileSystem(
  delegate: StateStoreFileSystem,
  runFilePath: string,
): PausedAggregateRenameFileSystem {
  const started = deferred();
  const released = deferred();
  let pauseNextAggregateRename = true;
  return {
    fs: createDelegatingStateStoreFileSystem(delegate, {
      rename: async (from, to) => {
        if (to === runFilePath && pauseNextAggregateRename) {
          pauseNextAggregateRename = false;
          started.resolve();
          await released.promise;
        }
        await delegate.rename(from, to);
      },
    }),
    renameStarted: started.promise,
    releaseRename: released.resolve,
  };
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

export function isFulfilledOutcome<T>(
  outcome: PromiseSettledResult<T>,
): outcome is PromiseFulfilledResult<T> {
  return outcome.status === "fulfilled";
}

export function isRejectedOutcome<T>(
  outcome: PromiseSettledResult<T>,
): outcome is PromiseRejectedResult {
  return !isFulfilledOutcome(outcome);
}

export function rejectedOutcomeMessage(
  outcome: PromiseSettledResult<unknown> | undefined,
): string | undefined {
  if (outcome === undefined || isFulfilledOutcome(outcome)) return undefined;
  const reason: unknown = outcome.reason;
  return reason instanceof Error ? reason.message : undefined;
}

async function runInterruptedAppend(
  mode: typeof PRE_PUBLICATION_MODE | typeof POST_PUBLICATION_MODE,
  runFilePath: string,
  identity: JournalIdentity,
  input: JournalEventInput,
): Promise<number | undefined> {
  const productDir = process.cwd();
  const tsxBinary = join(productDir, ...TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH);
  const result = await execa(
    tsxBinary,
    [...TEST_TYPESCRIPT_EXECUTION_ARGS, interruptedAppendScript()],
    {
      cwd: productDir,
      env: {
        ...buildGitTestEnvironment(),
        [INTERRUPTION_MODE_ENV]: mode,
        [INTERRUPTION_IDENTITY_ENV]: JSON.stringify(identity),
        [INTERRUPTION_INPUT_ENV]: JSON.stringify(input),
        [INTERRUPTION_RUN_FILE_ENV]: runFilePath,
      },
      extendEnv: false,
      reject: false,
    },
  );
  return result.exitCode;
}

function interruptedAppendScript(): string {
  return `
    import { createJournal } from "@/lib/agent-run-journal";
    import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
    import { defaultStateStoreFileSystem, EXCLUSIVE_CREATE_FLAG } from "@/lib/state-store";

    const mode = process.env.${INTERRUPTION_MODE_ENV};
    const identity = JSON.parse(process.env.${INTERRUPTION_IDENTITY_ENV});
    const input = JSON.parse(process.env.${INTERRUPTION_INPUT_ENV});
    const runFilePath = process.env.${INTERRUPTION_RUN_FILE_ENV};
    const fs = {
      ...defaultStateStoreFileSystem,
      async writeFile(path, data, options) {
        await defaultStateStoreFileSystem.writeFile(path, data, options);
        if (mode === ${JSON.stringify(PRE_PUBLICATION_MODE)} && options?.flag === EXCLUSIVE_CREATE_FLAG) {
          process.exit(${APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.PRE_PUBLICATION});
        }
      },
      async link(existingPath, newPath) {
        await defaultStateStoreFileSystem.link(existingPath, newPath);
        if (mode === ${JSON.stringify(POST_PUBLICATION_MODE)}) {
          process.exit(${APPENDABLE_JOURNAL_INTERRUPTION_EXIT_CODE.POST_PUBLICATION});
        }
      },
    };
    await createJournal(createAppendableJournalStore({ runFilePath, fs }), identity).append(input);
  `;
}

function createInterruptedSealFileSystem(
  runFilePath: string,
  delegate: StateStoreFileSystem,
): StateStoreFileSystem {
  let interruptAggregateRename = true;
  return createDelegatingStateStoreFileSystem(delegate, {
    rename: async (from, to) => {
      if (to === runFilePath && interruptAggregateRename) {
        interruptAggregateRename = false;
        throw new Error(APPENDABLE_JOURNAL_INTERRUPTION_ERROR.AGGREGATE_SEAL);
      }
      await delegate.rename(from, to);
    },
  });
}

function createInterruptedSealingBarrierFileSystem(
  delegate: StateStoreFileSystem,
): StateStoreFileSystem {
  let interruptBarrierWrite = true;
  return createDelegatingStateStoreFileSystem(delegate, {
    writeFile: async (path, data, options) => {
      await delegate.writeFile(path, data, options);
      if (data === APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT && interruptBarrierWrite) {
        interruptBarrierWrite = false;
        throw new Error(APPENDABLE_JOURNAL_INTERRUPTION_ERROR.SEALING_BARRIER);
      }
    },
  });
}
