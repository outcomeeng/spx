import {
  ERROR_CODE_NOT_FOUND,
  type JsonRecord,
  parseStateStoreError,
  publishJsonlRecordAtomically,
  readLatestJsonlRecord,
  removeAtomicJsonlTemporaryFiles,
  STATE_STORE_ERROR,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import {
  type AtomicJsonlPublicationFixture,
  sampleStateStoreTestValue,
  STATE_STORE_TEST_GENERATOR,
} from "@testing/generators/state-store/state-store";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  createDelegatingStateStoreFileSystem,
  createInMemoryStateStoreFileSystem,
} from "@testing/harnesses/state/in-memory-file-system";
import { expect } from "vitest";

const INJECTED_INTERRUPTION = "injected publication interruption";
const FIRST_PUBLISHER_TEMPORARY_BYTE = 0x11;
const SECOND_PUBLISHER_TEMPORARY_BYTE = 0x22;

type PublicationInterruption = "before-link" | "after-link" | undefined;

interface AtomicJsonlPublicationResult {
  readonly beforePublicationError: string | undefined;
  readonly beforePublicationDestinationError: string | undefined;
  readonly retry: unknown;
  readonly afterPublicationRecord: unknown;
  readonly guarded: unknown;
  readonly guardedDestinationError: string | undefined;
  readonly removedTemporary: unknown;
  readonly removedTemporaryDestinationError: string | undefined;
  readonly cleanup: unknown;
  readonly cleanupAfterRemoval: unknown;
  readonly destinationContent: string;
  readonly nonMatchingContent: string;
}

export interface AtomicJsonlPublicationObservation {
  readonly actual: AtomicJsonlPublicationResult;
  readonly firstRecord: JsonRecord;
  readonly secondRecord: JsonRecord;
  readonly fixture: AtomicJsonlPublicationFixture;
}

let observationPromise: Promise<AtomicJsonlPublicationObservation> | undefined;

/** Exercise atomic publication boundaries and return observations plus fixture inputs. */
export function atomicJsonlPublicationObservation(): Promise<AtomicJsonlPublicationObservation> {
  observationPromise ??= collectAtomicJsonlPublicationObservation();
  return observationPromise;
}

export async function assertAtomicJsonlPublicationCollisionProperty(): Promise<void> {
  await assertProperty(
    STATE_STORE_TEST_GENERATOR.atomicPublicationCollision(),
    async ({ destination, records: [firstRecord, secondRecord] }): Promise<boolean> => {
      const fs = createInMemoryStateStoreFileSystem();
      const [first, second] = await Promise.all([
        publishJsonlRecordAtomically(destination, firstRecord, {
          fs,
          randomBytes: (size) => Buffer.alloc(size, FIRST_PUBLISHER_TEMPORARY_BYTE),
        }),
        publishJsonlRecordAtomically(destination, secondRecord, {
          fs,
          randomBytes: (size) => Buffer.alloc(size, SECOND_PUBLISHER_TEMPORARY_BYTE),
        }),
      ]);
      const results = [first, second] as const;
      const winnerCount = results.filter((result) => result.ok).length;
      const collisionCount = results.filter(
        (result) => !result.ok && result.error === STATE_STORE_ERROR.RECORD_ALREADY_EXISTS,
      ).length;
      const winner = first.ok
        ? { record: firstRecord, result: first }
        : second.ok
        ? { record: secondRecord, result: second }
        : undefined;
      if (winner === undefined) return false;
      const destinationContent = await fs.readFile(destination, "utf8");
      return winnerCount === 1
        && collisionCount === 1
        && winner.result.value === destination
        && destinationContent === `${JSON.stringify(winner.record)}\n`;
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export async function assertAtomicJsonlPublicationMapping(): Promise<void> {
  const observation = await atomicJsonlPublicationObservation();
  expect(observation.actual.beforePublicationError).toBe(STATE_STORE_ERROR.RECORD_WRITE_FAILED);
  expect(observation.actual.beforePublicationDestinationError).toBe(ERROR_CODE_NOT_FOUND);
  expect(observation.actual.retry).toEqual({ ok: true, value: observation.fixture.paths.prePublicationRecord });
  expect(observation.actual.afterPublicationRecord).toEqual({ ok: true, value: observation.secondRecord });
  expect(observation.actual.guarded).toEqual({ ok: false, error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED });
  expect(observation.actual.guardedDestinationError).toBe(ERROR_CODE_NOT_FOUND);
  expect(observation.actual.removedTemporary).toEqual({
    ok: false,
    error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
  });
  expect(observation.actual.removedTemporaryDestinationError).toBe(ERROR_CODE_NOT_FOUND);
}

export async function assertAtomicJsonlPublicationCompliance(): Promise<void> {
  const observation = await atomicJsonlPublicationObservation();
  expect(observation.actual.cleanup).toEqual({ ok: true, value: 2 });
  expect(observation.actual.cleanupAfterRemoval).toEqual({ ok: true, value: 0 });
  expect(observation.actual.destinationContent).toBe(observation.fixture.content.destination);
  expect(observation.actual.nonMatchingContent).toBe(observation.fixture.content.nonMatching);
}

async function collectAtomicJsonlPublicationObservation(): Promise<AtomicJsonlPublicationObservation> {
  const [firstRecord, secondRecord] = sampleStateStoreTestValue(
    STATE_STORE_TEST_GENERATOR.jsonRecordPair(),
  );
  const fixture = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.atomicPublicationFixture());
  const { paths } = fixture;
  const fs = createLinkCapableFileSystem();

  const beforeDelegate = createInMemoryStateStoreFileSystem();
  const interruptedBefore = createLinkCapableFileSystem("before-link", beforeDelegate);
  const beforeResult = await publishJsonlRecordAtomically(paths.prePublicationRecord, firstRecord, {
    fs: interruptedBefore,
  });
  const beforePublicationDestinationError = await rejectedErrorCode(
    interruptedBefore.readFile(paths.prePublicationRecord, "utf8"),
  );
  const retry = await publishJsonlRecordAtomically(paths.prePublicationRecord, firstRecord, {
    fs: createLinkCapableFileSystem(undefined, beforeDelegate),
  });

  const interruptedAfter = createLinkCapableFileSystem("after-link");
  await publishJsonlRecordAtomically(paths.postPublicationRecord, secondRecord, {
    fs: interruptedAfter,
  });
  const afterPublicationRecord = await readLatestJsonlRecord(paths.postPublicationRecord, {
    fs: interruptedAfter,
  });

  const guarded = await publishJsonlRecordAtomically(paths.blockedRecord, firstRecord, {
    fs,
    publicationGuard: async () => false,
  });
  const guardedDestinationError = await rejectedErrorCode(fs.readFile(paths.blockedRecord, "utf8"));

  let temporaryPath: string | undefined;
  const removedTemporaryFileSystem = createTemporaryCapturingFileSystem(fs, (path) => {
    temporaryPath = path;
  });
  const removedTemporary = await publishJsonlRecordAtomically(
    paths.removedTemporaryRecord,
    firstRecord,
    {
      fs: removedTemporaryFileSystem,
      publicationGuard: async () => {
        if (temporaryPath !== undefined) await fs.rm(temporaryPath, { force: true });
        return true;
      },
    },
  );
  const removedTemporaryDestinationError = await rejectedErrorCode(
    fs.readFile(paths.removedTemporaryRecord, "utf8"),
  );

  await seedTemporaryCleanupFiles(fs, fixture, firstRecord, secondRecord);
  const cleanup = await removeAtomicJsonlTemporaryFiles(paths.cleanupDestinationPrefix, { fs });
  const cleanupAfterRemoval = await removeAtomicJsonlTemporaryFiles(paths.cleanupDestinationPrefix, { fs });

  return {
    actual: {
      beforePublicationError: !beforeResult.ok
        ? parseStateStoreError(beforeResult.error)?.code
        : undefined,
      beforePublicationDestinationError,
      retry,
      afterPublicationRecord,
      guarded,
      guardedDestinationError,
      removedTemporary,
      removedTemporaryDestinationError,
      cleanup,
      cleanupAfterRemoval,
      destinationContent: await fs.readFile(paths.cleanupDestination, "utf8"),
      nonMatchingContent: await fs.readFile(paths.nonMatchingFile, "utf8"),
    },
    firstRecord,
    secondRecord,
    fixture,
  };
}

async function seedTemporaryCleanupFiles(
  fs: StateStoreFileSystem,
  fixture: AtomicJsonlPublicationFixture,
  firstRecord: JsonRecord,
  secondRecord: JsonRecord,
): Promise<void> {
  const preserveUnpublishedTemporary = createDelegatingStateStoreFileSystem(fs, {
    link: async () => {
      throw new Error(INJECTED_INTERRUPTION);
    },
    rm: async () => {
      throw new Error(INJECTED_INTERRUPTION);
    },
  });
  await publishJsonlRecordAtomically(fixture.paths.firstCleanupDestination, firstRecord, {
    fs: preserveUnpublishedTemporary,
    randomBytes: (size) => Buffer.alloc(size, FIRST_PUBLISHER_TEMPORARY_BYTE),
  });
  await publishJsonlRecordAtomically(fixture.paths.secondCleanupDestination, secondRecord, {
    fs: preserveUnpublishedTemporary,
    randomBytes: (size) => Buffer.alloc(size, SECOND_PUBLISHER_TEMPORARY_BYTE),
  });
  await fs.writeFile(fixture.paths.cleanupDestination, fixture.content.destination);
  await fs.writeFile(fixture.paths.nonMatchingFile, fixture.content.nonMatching);
}

async function rejectedErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : undefined;
  }
}

function createTemporaryCapturingFileSystem(
  delegate: StateStoreFileSystem,
  capture: (path: string) => void,
): StateStoreFileSystem {
  return createDelegatingStateStoreFileSystem(delegate, {
    writeFile: async (path, data, options) => {
      await delegate.writeFile(path, data, options);
      if (options?.flag !== undefined) capture(path);
    },
  });
}

function createLinkCapableFileSystem(
  interruption?: PublicationInterruption,
  delegate: StateStoreFileSystem = createInMemoryStateStoreFileSystem(),
): StateStoreFileSystem {
  return createDelegatingStateStoreFileSystem(delegate, {
    link: async (existingPath, newPath) => {
      if (interruption === "before-link") throw new Error(INJECTED_INTERRUPTION);
      await delegate.link(existingPath, newPath);
      if (interruption === "after-link") throw new Error(INJECTED_INTERRUPTION);
    },
  });
}
