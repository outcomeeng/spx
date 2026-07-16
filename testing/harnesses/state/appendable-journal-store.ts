import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { execa } from "execa";
import fc from "fast-check";

import {
  CLOUDEVENTS_SPECVERSION,
  createJournal,
  JOURNAL_ERROR,
  JOURNAL_SEQ_BASE,
  type JournalEvent,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
  createAppendableJournalStore,
} from "@/lib/appendable-journal-store";
import { serializeJsonlRecord, type StateStoreFileSystem } from "@/lib/state-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { buildGitTestEnvironment } from "@testing/harnesses/git-test-constants";
import { PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
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
const PRE_PUBLICATION_EXIT_CODE = 73;
const POST_PUBLICATION_EXIT_CODE = 74;
const INTERRUPTION_MODE_ENV = "SPX_JOURNAL_INTERRUPTION_MODE";
const INTERRUPTION_IDENTITY_ENV = "SPX_JOURNAL_INTERRUPTION_IDENTITY";
const INTERRUPTION_INPUT_ENV = "SPX_JOURNAL_INTERRUPTION_INPUT";
const INTERRUPTION_RUN_FILE_ENV = "SPX_JOURNAL_INTERRUPTION_RUN_FILE";
const PRE_PUBLICATION_MODE = "pre-publication";
const POST_PUBLICATION_MODE = "post-publication";
const INJECTED_SEAL_INTERRUPTION = "injected seal interruption";
const INJECTED_SEALING_BARRIER_INTERRUPTION = "injected sealing barrier interruption";

export const OVERLAPPING_APPEND_SEQUENCE_PROPERTY = {
  arbitrary: fc.tuple(
    arbitraryJournalEventInput(),
    arbitraryJournalEventInput(),
    arbitraryJournalIdentity(),
  ),
  predicate: async ([leftInput, rightInput, identity]: readonly [
    JournalEventInput,
    JournalEventInput,
    JournalIdentity,
  ]): Promise<boolean> => {
    const fs = createInMemoryStateStoreFileSystem();
    const runFilePath = journalRunFilePath(identity.streamid);
    const leftJournal = createJournal(
      createAppendableJournalStore({ runFilePath, fs }),
      identity,
    );
    const rightJournal = createJournal(
      createAppendableJournalStore({ runFilePath, fs }),
      identity,
    );
    const outcomes = await Promise.allSettled([
      leftJournal.append(leftInput),
      rightJournal.append(rightInput),
    ]);
    const replay = await createAppendableJournalStore({ runFilePath, fs }).readAll();
    const fulfilled = outcomes.filter(isFulfilled);
    const rejected = outcomes.filter(isRejected);
    return isDeepStrictEqual(
      replay.map((event) => event.seq),
      replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
    )
      && new Set(replay.map((event) => event.seq)).size === replay.length
      && fulfilled.length === replay.length
      && rejected.length === 1
      && rejectionMessage(rejected[0]) === JOURNAL_ERROR.SEQ_CONSUMED;
  },
  classification: { level: PROPERTY_LEVEL.L1 },
} as const;

export const APPENDABLE_JOURNAL_SEALING_RACE_PROPERTY = {
  arbitrary: fc.tuple(
    arbitraryJournalEventInput(),
    arbitraryJournalEventInput(),
    arbitraryJournalIdentity(),
  ),
  predicate: async ([firstInput, secondInput, identity]: readonly [
    JournalEventInput,
    JournalEventInput,
    JournalIdentity,
  ]): Promise<boolean> =>
    (await sealingBarrierWins(identity, firstInput, secondInput))
    && (await appendPublicationWins(identity, firstInput, secondInput)),
  classification: { level: PROPERTY_LEVEL.L1 },
} as const;

interface ComparisonObservation<T> {
  readonly actual: T;
  readonly expected: T;
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

export type AppendableJournalInterruptionObservation = ComparisonObservation<
  AppendableJournalInterruptionResult
>;

let interruptionObservationPromise: Promise<AppendableJournalInterruptionObservation> | undefined;

/** Collect actual and expected recovery states across append and seal interruption boundaries. */
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
    actual: {
      prePublication: prePublication.actual,
      postPublication: postPublication.actual,
      aggregateSeal: aggregateSeal.actual,
      staleBarrier: staleBarrier.actual,
    },
    expected: {
      prePublication: prePublication.expected,
      postPublication: postPublication.expected,
      aggregateSeal: aggregateSeal.expected,
      staleBarrier: staleBarrier.expected,
    },
  };
}

async function observePrePublicationInterruption(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
): Promise<ComparisonObservation<PrePublicationInterruptionResult>> {
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
    return {
      actual: {
        exitCode,
        appendedSequence: appended.seq,
        replay: await reopenedStore.readAll(),
      },
      expected: {
        exitCode: PRE_PUBLICATION_EXIT_CODE,
        appendedSequence: JOURNAL_SEQ_BASE,
        replay: [appended],
      },
    };
  });
}

async function observePostPublicationInterruption(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<ComparisonObservation<PostPublicationInterruptionResult>> {
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
    const expectedFirst: JournalEvent = {
      id: firstInput.id,
      source: firstInput.source,
      type: firstInput.type,
      specversion: CLOUDEVENTS_SPECVERSION,
      time: firstInput.time,
      streamid: identity.streamid,
      seq: JOURNAL_SEQ_BASE,
      runid: identity.runid,
      attempt: firstInput.attempt,
      ...(firstInput.data === undefined ? {} : { data: firstInput.data }),
    };
    return {
      actual: { exitCode, replay, nextSequence: next.seq },
      expected: {
        exitCode: POST_PUBLICATION_EXIT_CODE,
        replay: [expectedFirst],
        nextSequence: JOURNAL_SEQ_BASE + 1,
      },
    };
  });
}

async function sealingBarrierWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<boolean> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const seedJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  );
  const first = await seedJournal.append(firstInput);
  const paused = createPausedPublicationFileSystem(base);
  const appendingJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: paused.fs }),
    identity,
  );
  const appendOutcomePromise = settle(appendingJournal.append(secondInput));
  await paused.linkStarted;

  await createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  ).seal();
  paused.releaseLink();
  const appendOutcome = await appendOutcomePromise;
  const hydratedReplay = await readHydratedReplay(base, runFilePath);

  return appendOutcome.status === "fulfilled"
    ? isDeepStrictEqual(hydratedReplay, [first, appendOutcome.value])
    : rejectionMessage(appendOutcome) === JOURNAL_ERROR.SEALED
      && isDeepStrictEqual(hydratedReplay, [first]);
}

async function appendPublicationWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<boolean> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const seedJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  );
  const first = await seedJournal.append(firstInput);
  const paused = createPausedPublicationFileSystem(base);
  const appendingJournal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: paused.fs }),
    identity,
  );
  const appendOutcomePromise = settle(appendingJournal.append(secondInput));
  await paused.linkStarted;

  const sealingFileSystem = createPublicationWinningSealFileSystem(
    runFilePath,
    base,
    paused,
  );
  await createJournal(
    createAppendableJournalStore({ runFilePath, fs: sealingFileSystem }),
    identity,
  ).seal();
  const appendOutcome = await appendOutcomePromise;
  return appendOutcome.status === "fulfilled"
    && isDeepStrictEqual(await readHydratedReplay(base, runFilePath), [first, appendOutcome.value]);
}

async function observeInterruptedSealRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<ComparisonObservation<AggregateSealInterruptionResult>> {
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
    actual: {
      sealError: rejectionMessage(sealOutcome),
      sealedAfterInterruption,
      replayAfterInterruption,
      hydratedReplay,
      unsealedAggregateReplay,
    },
    expected: {
      sealError: INJECTED_SEAL_INTERRUPTION,
      sealedAfterInterruption: false,
      replayAfterInterruption: appended,
      hydratedReplay: appended,
      unsealedAggregateReplay: [],
    },
  };
}

async function observeStaleSealingBarrierRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<ComparisonObservation<StaleBarrierInterruptionResult>> {
  const base = createInMemoryStateStoreFileSystem();
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(
    createAppendableJournalStore({ runFilePath, fs: base }),
    identity,
  );
  const appended = [
    await journal.append(firstInput),
    await journal.append(nextInput),
  ];
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
    actual: {
      sealError: rejectionMessage(sealOutcome),
      sealedAfterInterruption,
      appendError: rejectionMessage(appendOutcome),
      hydratedReplay: await readHydratedReplay(base, runFilePath),
    },
    expected: {
      sealError: INJECTED_SEALING_BARRIER_INTERRUPTION,
      sealedAfterInterruption: false,
      appendError: JOURNAL_ERROR.SEALED,
      hydratedReplay: appended,
    },
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
  readonly linkCompleted: Promise<void>;
  readonly temporaryPath: Promise<string>;
  releaseLink(): void;
}

function createPausedPublicationFileSystem(
  delegate: StateStoreFileSystem,
): PausedPublicationFileSystem {
  const started = deferred();
  const released = deferred();
  const completed = deferred();
  const temporaryPath = deferredValue<string>();
  return {
    fs: {
      mkdir: (path, options) => delegate.mkdir(path, options),
      writeFile: (path, data, options) => delegate.writeFile(path, data, options),
      appendFile: (path, data) => delegate.appendFile(path, data),
      readFile: (path, encoding) => delegate.readFile(path, encoding),
      readdir: (path, options) => delegate.readdir(path, options),
      lstat: (path) => delegate.lstat(path),
      link: async (existingPath, newPath) => {
        temporaryPath.resolve(existingPath);
        started.resolve();
        await released.promise;
        try {
          await delegate.link(existingPath, newPath);
        } finally {
          completed.resolve();
        }
      },
      rename: (from, to) => delegate.rename(from, to),
      rm: (path, options) => delegate.rm(path, options),
    },
    linkStarted: started.promise,
    linkCompleted: completed.promise,
    temporaryPath: temporaryPath.promise,
    releaseLink: released.resolve,
  };
}

function createPublicationWinningSealFileSystem(
  runFilePath: string,
  delegate: StateStoreFileSystem,
  paused: PausedPublicationFileSystem,
): StateStoreFileSystem {
  async function releasePublication(): Promise<void> {
    paused.releaseLink();
    await paused.linkCompleted;
  }
  const publicationTemporaryPath = paused.temporaryPath;
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => {
      if (path === runFilePath) await releasePublication();
      await delegate.writeFile(path, data, options);
    },
    appendFile: (path, data) => delegate.appendFile(path, data),
    readFile: (path, encoding) => delegate.readFile(path, encoding),
    readdir: (path, options) => delegate.readdir(path, options),
    lstat: (path) => delegate.lstat(path),
    link: (existingPath, newPath) => delegate.link(existingPath, newPath),
    rename: (from, to) => delegate.rename(from, to),
    rm: async (path, options) => {
      if (path === await publicationTemporaryPath) {
        await releasePublication();
      }
      await delegate.rm(path, options);
    },
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

function deferredValue<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise = (_value: T): void => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function isFulfilled<T>(
  outcome: PromiseSettledResult<T>,
): outcome is PromiseFulfilledResult<T> {
  return outcome.status === "fulfilled";
}

function isRejected<T>(
  outcome: PromiseSettledResult<T>,
): outcome is PromiseRejectedResult {
  return outcome.status === "rejected";
}

function rejectionMessage(
  outcome: PromiseSettledResult<unknown> | undefined,
): string | undefined {
  if (outcome?.status !== "rejected") return undefined;
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
          process.exit(${PRE_PUBLICATION_EXIT_CODE});
        }
      },
      async link(existingPath, newPath) {
        await defaultStateStoreFileSystem.link(existingPath, newPath);
        if (mode === ${JSON.stringify(POST_PUBLICATION_MODE)}) {
          process.exit(${POST_PUBLICATION_EXIT_CODE});
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
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: (path, data, options) => delegate.writeFile(path, data, options),
    appendFile: (path, data) => delegate.appendFile(path, data),
    readFile: (path, encoding) => delegate.readFile(path, encoding),
    readdir: (path, options) => delegate.readdir(path, options),
    lstat: (path) => delegate.lstat(path),
    link: (existingPath, newPath) => delegate.link(existingPath, newPath),
    rename: async (from, to) => {
      if (to === runFilePath && interruptAggregateRename) {
        interruptAggregateRename = false;
        throw new Error(INJECTED_SEAL_INTERRUPTION);
      }
      await delegate.rename(from, to);
    },
    rm: (path, options) => delegate.rm(path, options),
  };
}

function createInterruptedSealingBarrierFileSystem(
  delegate: StateStoreFileSystem,
): StateStoreFileSystem {
  let interruptBarrierWrite = true;
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => {
      await delegate.writeFile(path, data, options);
      if (data === APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT && interruptBarrierWrite) {
        interruptBarrierWrite = false;
        throw new Error(INJECTED_SEALING_BARRIER_INTERRUPTION);
      }
    },
    appendFile: (path, data) => delegate.appendFile(path, data),
    readFile: (path, encoding) => delegate.readFile(path, encoding),
    readdir: (path, options) => delegate.readdir(path, options),
    lstat: (path) => delegate.lstat(path),
    link: (existingPath, newPath) => delegate.link(existingPath, newPath),
    rename: (from, to) => delegate.rename(from, to),
    rm: (path, options) => delegate.rm(path, options),
  };
}
