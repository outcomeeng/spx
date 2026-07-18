import {
  type JsonRecord,
  parseStateStoreError,
  publishJsonlRecordAtomically,
  readLatestJsonlRecord,
  removeAtomicJsonlTemporaryFiles,
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

const INJECTED_INTERRUPTION = "injected publication interruption";
const FIRST_PUBLISHER_TEMPORARY_BYTE = 0x11;
const SECOND_PUBLISHER_TEMPORARY_BYTE = 0x22;
const LOOKALIKE_DESTINATION_TEMPORARY_BYTE = 0x33;

type PublicationInterruption = "before-link" | "after-link" | undefined;

interface AtomicJsonlPublicationResult {
  readonly beforePublicationError: string | undefined;
  readonly beforePublicationDestinationError: string | undefined;
  readonly retry: unknown;
  readonly afterPublicationResult: unknown;
  readonly afterPublicationRecord: unknown;
  readonly guarded: unknown;
  readonly guardedDestinationError: string | undefined;
  readonly removedTemporary: unknown;
  readonly removedTemporaryDestinationError: string | undefined;
  readonly cleanup: unknown;
  readonly cleanupAfterRemoval: unknown;
  readonly destinationContent: string;
  readonly lookalikeDestinationContent: string;
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
  const afterPublicationResult = await publishJsonlRecordAtomically(paths.postPublicationRecord, secondRecord, {
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

  const lookalikeDestination = await seedTemporaryCleanupFiles(fs, fixture, firstRecord, secondRecord);
  const cleanupOptions = {
    fs,
    isDeterministicDestination: (path: string): boolean =>
      path === paths.cleanupDestination || path === lookalikeDestination,
  };
  const cleanup = await removeAtomicJsonlTemporaryFiles(paths.cleanupDestinationPrefix, cleanupOptions);
  const cleanupAfterRemoval = await removeAtomicJsonlTemporaryFiles(paths.cleanupDestinationPrefix, cleanupOptions);

  return {
    actual: {
      beforePublicationError: !beforeResult.ok
        ? parseStateStoreError(beforeResult.error)?.code
        : undefined,
      beforePublicationDestinationError,
      retry,
      afterPublicationResult,
      afterPublicationRecord,
      guarded,
      guardedDestinationError,
      removedTemporary,
      removedTemporaryDestinationError,
      cleanup,
      cleanupAfterRemoval,
      destinationContent: await fs.readFile(paths.cleanupDestination, "utf8"),
      lookalikeDestinationContent: await fs.readFile(lookalikeDestination, "utf8"),
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
): Promise<string> {
  let lookalikeDestination: string | undefined;
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
  await publishJsonlRecordAtomically(fixture.paths.cleanupDestination, firstRecord, {
    fs: createTemporaryCapturingFileSystem(preserveUnpublishedTemporary, (path) => {
      lookalikeDestination = path;
    }),
    randomBytes: (size) => Buffer.alloc(size, LOOKALIKE_DESTINATION_TEMPORARY_BYTE),
  });
  await fs.writeFile(fixture.paths.cleanupDestination, fixture.content.destination);
  await fs.writeFile(fixture.paths.nonMatchingFile, fixture.content.nonMatching);
  if (lookalikeDestination === undefined) {
    throw new Error("Atomic JSONL cleanup fixture did not capture its lookalike destination");
  }
  return lookalikeDestination;
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
