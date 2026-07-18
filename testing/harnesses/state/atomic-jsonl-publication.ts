import {
  ERROR_CODE_NOT_FOUND,
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
import {
  createDelegatingStateStoreFileSystem,
  createInMemoryStateStoreFileSystem,
} from "@testing/harnesses/state/in-memory-file-system";
import { expect } from "vitest";

const INJECTED_INTERRUPTION = "injected publication interruption";

type PublicationInterruption = "before-link" | "after-link" | undefined;

interface AtomicJsonlPublicationResult {
  readonly first: unknown;
  readonly collision: unknown;
  readonly winnerContent: string;
  readonly beforePublicationError: string | undefined;
  readonly beforePublicationDestinationError: string | undefined;
  readonly retry: unknown;
  readonly afterPublicationRecord: unknown;
  readonly guarded: unknown;
  readonly guardedDestinationError: string | undefined;
  readonly removedTemporary: unknown;
  readonly cleanup: unknown;
  readonly firstCleanupError: string | undefined;
  readonly secondCleanupError: string | undefined;
  readonly destinationContent: string;
  readonly nonMatchingContent: string;
}

export interface AtomicJsonlPublicationObservation {
  readonly actual: AtomicJsonlPublicationResult;
  readonly firstRecord: unknown;
  readonly secondRecord: unknown;
  readonly fixture: AtomicJsonlPublicationFixture;
}

let observationPromise: Promise<AtomicJsonlPublicationObservation> | undefined;

/** Exercise atomic publication boundaries and return observations plus fixture inputs. */
export function atomicJsonlPublicationObservation(): Promise<AtomicJsonlPublicationObservation> {
  observationPromise ??= collectAtomicJsonlPublicationObservation();
  return observationPromise;
}

export async function assertAtomicJsonlPublicationCompliance(): Promise<void> {
  const observation = await atomicJsonlPublicationObservation();
  expect(observation.actual.first).toEqual({ ok: true, value: observation.fixture.paths.atomicRecord });
  expect(observation.actual.collision).toEqual({ ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS });
  expect(observation.actual.winnerContent).toBe(`${JSON.stringify(observation.firstRecord)}\n`);
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
  expect(observation.actual.cleanup).toEqual({ ok: true, value: 2 });
  expect(observation.actual.firstCleanupError).toBe(ERROR_CODE_NOT_FOUND);
  expect(observation.actual.secondCleanupError).toBe(ERROR_CODE_NOT_FOUND);
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
  const first = await publishJsonlRecordAtomically(paths.atomicRecord, firstRecord, { fs });
  const collision = await publishJsonlRecordAtomically(paths.atomicRecord, secondRecord, { fs });

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

  await seedTemporaryCleanupFiles(fs, fixture);
  const cleanup = await removeAtomicJsonlTemporaryFiles(paths.cleanupDestinationPrefix, { fs });

  return {
    actual: {
      first,
      collision,
      winnerContent: await fs.readFile(paths.atomicRecord, "utf8"),
      beforePublicationError: !beforeResult.ok
        ? parseStateStoreError(beforeResult.error)?.code
        : undefined,
      beforePublicationDestinationError,
      retry,
      afterPublicationRecord,
      guarded,
      guardedDestinationError,
      removedTemporary,
      cleanup,
      firstCleanupError: await rejectedErrorCode(fs.readFile(paths.firstCleanupTemporary, "utf8")),
      secondCleanupError: await rejectedErrorCode(fs.readFile(paths.secondCleanupTemporary, "utf8")),
      destinationContent: await fs.readFile(paths.cleanupDestination, "utf8"),
      nonMatchingContent: await fs.readFile(paths.nonMatchingTemporary, "utf8"),
    },
    firstRecord,
    secondRecord,
    fixture,
  };
}

async function seedTemporaryCleanupFiles(
  fs: StateStoreFileSystem,
  fixture: AtomicJsonlPublicationFixture,
): Promise<void> {
  await fs.writeFile(fixture.paths.firstCleanupTemporary, fixture.content.firstCleanup);
  await fs.writeFile(fixture.paths.secondCleanupTemporary, fixture.content.secondCleanup);
  await fs.writeFile(fixture.paths.cleanupDestination, fixture.content.destination);
  await fs.writeFile(fixture.paths.nonMatchingTemporary, fixture.content.nonMatching);
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
