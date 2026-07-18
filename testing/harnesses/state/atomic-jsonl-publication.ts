import {
  parseStateStoreError,
  publishJsonlRecordAtomically,
  readLatestJsonlRecord,
  removeAtomicJsonlTemporaryFiles,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  createDelegatingStateStoreFileSystem,
  createInMemoryStateStoreFileSystem,
} from "@testing/harnesses/state/in-memory-file-system";

const ATOMIC_RECORD_PATH = "record-store/atomic-record.jsonl";
const PRE_PUBLICATION_RECORD_PATH = "record-store/pre-publication.jsonl";
const POST_PUBLICATION_RECORD_PATH = "record-store/post-publication.jsonl";
const INJECTED_INTERRUPTION = "injected publication interruption";
const BLOCKED_RECORD_PATH = "record-store/blocked-record.jsonl";
const REMOVED_TEMPORARY_RECORD_PATH = "record-store/removed-temporary-record.jsonl";
const CLEANUP_DESTINATION_PREFIX = "record-store/cleanup-record-";
const FIRST_CLEANUP_TEMPORARY_PATH = "record-store/cleanup-record-1.jsonl.000000000001.tmp";
const SECOND_CLEANUP_TEMPORARY_PATH = "record-store/cleanup-record-2.jsonl.000000000002.tmp";
const CLEANUP_DESTINATION_PATH = "record-store/cleanup-record-1.jsonl";
const NON_MATCHING_TEMPORARY_PATH = "record-store/cleanup-record-3.jsonl.invalid.tmp";
const FIRST_CLEANUP_CONTENT = "first";
const SECOND_CLEANUP_CONTENT = "second";
const DESTINATION_CONTENT = "destination";
const NON_MATCHING_CONTENT = "unowned";

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
  readonly paths: {
    readonly atomicRecord: string;
    readonly prePublicationRecord: string;
    readonly postPublicationRecord: string;
  };
  readonly preservedContent: {
    readonly destination: string;
    readonly nonMatching: string;
  };
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
  const fs = createLinkCapableFileSystem();
  const first = await publishJsonlRecordAtomically(ATOMIC_RECORD_PATH, firstRecord, { fs });
  const collision = await publishJsonlRecordAtomically(ATOMIC_RECORD_PATH, secondRecord, { fs });

  const beforeDelegate = createInMemoryStateStoreFileSystem();
  const interruptedBefore = createLinkCapableFileSystem("before-link", beforeDelegate);
  const beforeResult = await publishJsonlRecordAtomically(PRE_PUBLICATION_RECORD_PATH, firstRecord, {
    fs: interruptedBefore,
  });
  const beforePublicationDestinationError = await rejectedErrorCode(
    interruptedBefore.readFile(PRE_PUBLICATION_RECORD_PATH, "utf8"),
  );
  const retry = await publishJsonlRecordAtomically(PRE_PUBLICATION_RECORD_PATH, firstRecord, {
    fs: createLinkCapableFileSystem(undefined, beforeDelegate),
  });

  const interruptedAfter = createLinkCapableFileSystem("after-link");
  await publishJsonlRecordAtomically(POST_PUBLICATION_RECORD_PATH, secondRecord, {
    fs: interruptedAfter,
  });
  const afterPublicationRecord = await readLatestJsonlRecord(POST_PUBLICATION_RECORD_PATH, {
    fs: interruptedAfter,
  });

  const guarded = await publishJsonlRecordAtomically(BLOCKED_RECORD_PATH, firstRecord, {
    fs,
    publicationGuard: async () => false,
  });
  const guardedDestinationError = await rejectedErrorCode(fs.readFile(BLOCKED_RECORD_PATH, "utf8"));

  let temporaryPath: string | undefined;
  const removedTemporaryFileSystem = createTemporaryCapturingFileSystem(fs, (path) => {
    temporaryPath = path;
  });
  const removedTemporary = await publishJsonlRecordAtomically(
    REMOVED_TEMPORARY_RECORD_PATH,
    firstRecord,
    {
      fs: removedTemporaryFileSystem,
      publicationGuard: async () => {
        if (temporaryPath !== undefined) await fs.rm(temporaryPath, { force: true });
        return true;
      },
    },
  );

  await seedTemporaryCleanupFiles(fs);
  const cleanup = await removeAtomicJsonlTemporaryFiles(CLEANUP_DESTINATION_PREFIX, { fs });

  return {
    actual: {
      first,
      collision,
      winnerContent: await fs.readFile(ATOMIC_RECORD_PATH, "utf8"),
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
      firstCleanupError: await rejectedErrorCode(fs.readFile(FIRST_CLEANUP_TEMPORARY_PATH, "utf8")),
      secondCleanupError: await rejectedErrorCode(fs.readFile(SECOND_CLEANUP_TEMPORARY_PATH, "utf8")),
      destinationContent: await fs.readFile(CLEANUP_DESTINATION_PATH, "utf8"),
      nonMatchingContent: await fs.readFile(NON_MATCHING_TEMPORARY_PATH, "utf8"),
    },
    firstRecord,
    secondRecord,
    paths: {
      atomicRecord: ATOMIC_RECORD_PATH,
      prePublicationRecord: PRE_PUBLICATION_RECORD_PATH,
      postPublicationRecord: POST_PUBLICATION_RECORD_PATH,
    },
    preservedContent: {
      destination: DESTINATION_CONTENT,
      nonMatching: NON_MATCHING_CONTENT,
    },
  };
}

async function seedTemporaryCleanupFiles(fs: StateStoreFileSystem): Promise<void> {
  await fs.writeFile(FIRST_CLEANUP_TEMPORARY_PATH, FIRST_CLEANUP_CONTENT);
  await fs.writeFile(SECOND_CLEANUP_TEMPORARY_PATH, SECOND_CLEANUP_CONTENT);
  await fs.writeFile(CLEANUP_DESTINATION_PATH, DESTINATION_CONTENT);
  await fs.writeFile(NON_MATCHING_TEMPORARY_PATH, NON_MATCHING_CONTENT);
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
