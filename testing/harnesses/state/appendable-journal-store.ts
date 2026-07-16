import { dirname, join } from "node:path";

import { execa } from "execa";
import fc from "fast-check";
import { expect } from "vitest";

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
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
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
const PARTIAL_WRITE_DIVISOR = 2;
const MINIMUM_PARTIAL_WRITE_LENGTH = 1;
const INJECTED_SEAL_INTERRUPTION = "injected seal interruption";
const INJECTED_SEALING_BARRIER_INTERRUPTION = "injected sealing barrier interruption";

/** Prove sequence exclusivity when independent stores append to one run history concurrently. */
export async function assertOverlappingAppendSequenceProperty(): Promise<void> {
  await assertProperty(
    fc.tuple(
      arbitraryJournalEventInput(),
      arbitraryJournalEventInput(),
      arbitraryJournalIdentity(),
    ),
    async ([leftInput, rightInput, identity]) => {
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
      const replay = await createAppendableJournalStore({
        runFilePath,
        fs,
      }).readAll();
      const fulfilled = outcomes.filter(isFulfilled);
      const rejected = outcomes.filter(isRejected);

      expect(replay.map((event) => event.seq)).toEqual(
        replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
      );
      expect(new Set(replay.map((event) => event.seq)).size).toBe(
        replay.length,
      );
      expect(fulfilled).toHaveLength(replay.length);
      expect(rejected).toHaveLength(1);
      expect(rejectionMessage(rejected[0])).toBe(JOURNAL_ERROR.SEQ_CONSUMED);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

/** Prove sealing cannot omit an append that reports successful publication. */
export async function assertAppendableJournalSealingRaceProperty(): Promise<void> {
  await assertProperty(
    fc.tuple(
      arbitraryJournalEventInput(),
      arbitraryJournalEventInput(),
      arbitraryJournalIdentity(),
    ),
    async ([firstInput, secondInput, identity]) => {
      await assertSealingBarrierWins(identity, firstInput, secondInput);
      await assertAppendPublicationWins(identity, firstInput, secondInput);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

/** Prove fresh processes recover on both sides of atomic sequence publication. */
export async function assertAppendableJournalInterruptionCompliance(): Promise<void> {
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const firstInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const nextInput = sampleAgentRunJournalValue(arbitraryJournalEventInput());

  await withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    expect(
      await runInterruptedAppend(
        PRE_PUBLICATION_MODE,
        runFilePath,
        identity,
        firstInput,
      ),
    ).toBe(PRE_PUBLICATION_EXIT_CODE);

    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const reopened = createJournal(reopenedStore, identity);
    const appended = await reopened.append(firstInput);
    expect(appended.seq).toBe(JOURNAL_SEQ_BASE);
    await expect(reopenedStore.readAll()).resolves.toEqual([appended]);
  });

  await withTempDir(INTERRUPTION_TEMP_DIR_PREFIX, async (tempDir) => {
    const runFilePath = join(tempDir, journalRunFilePath(identity.streamid));
    expect(
      await runInterruptedAppend(
        POST_PUBLICATION_MODE,
        runFilePath,
        identity,
        firstInput,
      ),
    ).toBe(POST_PUBLICATION_EXIT_CODE);

    const reopenedStore = createAppendableJournalStore({ runFilePath });
    const reopened = createJournal(reopenedStore, identity);
    const replay = await reopenedStore.readAll();
    expect(replay).toHaveLength(1);
    expect(replay[0]).toMatchObject({
      id: firstInput.id,
      source: firstInput.source,
      type: firstInput.type,
      specversion: CLOUDEVENTS_SPECVERSION,
      time: firstInput.time,
      streamid: identity.streamid,
      seq: JOURNAL_SEQ_BASE,
      runid: identity.runid,
      attempt: firstInput.attempt,
    });
    expect(replay[0]?.data).toEqual(firstInput.data);
    await expect(reopened.append(nextInput)).resolves.toMatchObject({
      seq: JOURNAL_SEQ_BASE + 1,
    });
  });

  await assertInterruptedSealRecovery(identity, firstInput, nextInput);
  await assertStaleSealingBarrierRecovery(identity, firstInput, nextInput);
}

async function assertSealingBarrierWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<void> {
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

  if (appendOutcome.status === "fulfilled") {
    expect(hydratedReplay).toEqual([first, appendOutcome.value]);
  } else {
    expect(rejectionMessage(appendOutcome)).toBe(JOURNAL_ERROR.SEALED);
    expect(hydratedReplay).toEqual([first]);
  }
}

async function assertAppendPublicationWins(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  secondInput: JournalEventInput,
): Promise<void> {
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
  expect(appendOutcome.status).toBe("fulfilled");
  if (appendOutcome.status !== "fulfilled") return;

  await expect(readHydratedReplay(base, runFilePath)).resolves.toEqual([
    first,
    appendOutcome.value,
  ]);
}

async function assertInterruptedSealRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<void> {
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

  await expect(journal.seal()).rejects.toThrow(INJECTED_SEAL_INTERRUPTION);
  const reopenedStore = createAppendableJournalStore({ runFilePath, fs: base });
  await expect(reopenedStore.isSealed()).resolves.toBe(false);
  await expect(reopenedStore.readAll()).resolves.toEqual(appended);

  await createJournal(reopenedStore, identity).seal();
  const aggregate = await base.readFile(runFilePath, "utf8");
  const hydrated = createInMemoryStateStoreFileSystem();
  await hydrated.mkdir(join(runFilePath, ".."), { recursive: true });
  await hydrated.writeFile(runFilePath, aggregate);
  await hydrated.writeFile(
    appendableJournalSealMarkerPath(runFilePath),
    APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  );
  await expect(
    createAppendableJournalStore({ runFilePath, fs: hydrated }).readAll(),
  ).resolves.toEqual(appended);

  const unsealedAggregate = createInMemoryStateStoreFileSystem();
  await unsealedAggregate.mkdir(join(runFilePath, ".."), { recursive: true });
  await unsealedAggregate.writeFile(
    runFilePath,
    serializeJsonlRecord({ ...appended[0] }),
  );
  await expect(
    createAppendableJournalStore({
      runFilePath,
      fs: unsealedAggregate,
    }).readAll(),
  ).resolves.toEqual([]);
}

async function assertStaleSealingBarrierRecovery(
  identity: JournalIdentity,
  firstInput: JournalEventInput,
  nextInput: JournalEventInput,
): Promise<void> {
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

  await expect(
    createJournal(
      createAppendableJournalStore({ runFilePath, fs: interrupted }),
      identity,
    ).seal(),
  ).rejects.toThrow(INJECTED_SEALING_BARRIER_INTERRUPTION);
  await expect(
    createAppendableJournalStore({ runFilePath, fs: base }).isSealed(),
  ).resolves.toBe(false);
  await expect(journal.append(firstInput)).rejects.toThrow(
    JOURNAL_ERROR.SEALED,
  );

  await journal.seal();
  await expect(readHydratedReplay(base, runFilePath)).resolves.toEqual(
    appended,
  );
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
  outcome: PromiseRejectedResult | undefined,
): string | undefined {
  const reason: unknown = outcome?.reason;
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
  let interruptAggregateWrite = true;
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => {
      if (path === runFilePath && interruptAggregateWrite) {
        interruptAggregateWrite = false;
        const partialLength = Math.max(
          MINIMUM_PARTIAL_WRITE_LENGTH,
          Math.floor(data.length / PARTIAL_WRITE_DIVISOR),
        );
        await delegate.writeFile(path, data.slice(0, partialLength), options);
        throw new Error(INJECTED_SEAL_INTERRUPTION);
      }
      await delegate.writeFile(path, data, options);
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
