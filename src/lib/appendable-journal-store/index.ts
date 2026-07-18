import { randomBytes as nodeRandomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";

import {
  type AppendableBackend,
  checkJournalEventConformance,
  JOURNAL_BACKEND_KIND,
  JOURNAL_ERROR,
  type JournalEvent,
} from "@/lib/agent-run-journal";
import { type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  type JsonRecord,
  publishJsonlRecordAtomically,
  removeAtomicJsonlTemporaryFiles,
  serializeJsonlRecord,
  STATE_STORE_ERROR,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";

const SEAL_MARKER_SUFFIX = ".sealed";
const SEALING_MARKER_SUFFIX = ".sealing";
const CREATION_MARKER_SUFFIX = ".created";
const SEQUENCE_RECORD_MARKER = ".seq-";
const SEQUENCE_RECORD_SUFFIX = ".jsonl";
const SEQUENCE_TOKEN_PATTERN = /^[1-9]\d*$/;
export const APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT = "";
const AGGREGATE_TEMPORARY_MARKER = ".aggregate";
const ATOMIC_TEMPORARY_SUFFIX = ".tmp";
const AGGREGATE_TEMPORARY_ID_BYTES = 6;
const AGGREGATE_TEMPORARY_CREATE_ATTEMPTS = 10;
const LINE_SEPARATOR = "\n";

interface SequenceRecordAddress {
  readonly path: string;
  readonly sequence: number;
}

export interface AppendableJournalStoreOptions {
  /** The resolved `.spx/` run file path that holds this stream's JSONL history. */
  readonly runFilePath: string;
  /** Injected filesystem; defaults to the real state-store filesystem. */
  readonly fs?: StateStoreFileSystem;
  /** Injected temporary-name entropy for atomic sequence-record publication. */
  readonly randomBytes?: (size: number) => Buffer;
}

export function appendableJournalSealMarkerPath(runFilePath: string): string {
  return `${runFilePath}${SEAL_MARKER_SUFFIX}`;
}

export function appendableJournalCreationMarkerPath(runFilePath: string): string {
  return `${runFilePath}${CREATION_MARKER_SUFFIX}`;
}

export function appendableJournalSealingMarkerPath(runFilePath: string): string {
  return `${runFilePath}${SEALING_MARKER_SUFFIX}`;
}

export function appendableJournalSequenceRecordPath(runFilePath: string, sequence: number): string {
  return `${runFilePath}${SEQUENCE_RECORD_MARKER}${sequence}${SEQUENCE_RECORD_SUFFIX}`;
}

/** Bind the agent-run-journal `AppendableBackend` port to a JSONL run file on an injected filesystem. */
export function createAppendableJournalStore(options: AppendableJournalStoreOptions): AppendableBackend {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const { runFilePath } = options;
  const creationMarkerPath = appendableJournalCreationMarkerPath(runFilePath);
  const sealMarkerPath = appendableJournalSealMarkerPath(runFilePath);
  const sealingMarkerPath = appendableJournalSealingMarkerPath(runFilePath);
  const cachedSequenceEvents = new Map<number, JournalEvent>();
  const inspectedSequenceRecordPaths = new Set<string>();

  async function readSequenceEvents(
    sequenceRecords: readonly SequenceRecordAddress[],
  ): Promise<readonly JournalEvent[]> {
    for (const sequenceRecord of sequenceRecords) {
      if (inspectedSequenceRecordPaths.has(sequenceRecord.path)) continue;
      const content = await readFileOrUndefined(fs, sequenceRecord.path);
      for (const event of parseJournalEvents(content)) {
        if (event.seq === sequenceRecord.sequence) {
          cachedSequenceEvents.set(event.seq, event);
        }
      }
      if (content !== undefined) inspectedSequenceRecordPaths.add(sequenceRecord.path);
    }
    return sequenceRecords
      .flatMap((record) => {
        const event = cachedSequenceEvents.get(record.sequence);
        return event === undefined ? [] : [event];
      })
      .sort((left, right) => left.seq - right.seq);
  }

  async function readAll(): Promise<readonly JournalEvent[]> {
    const sequenceRecords = await listSequenceRecords(fs, runFilePath);
    if (sequenceRecords.length > 0) return readSequenceEvents(sequenceRecords);
    if ((await readFileOrUndefined(fs, sealMarkerPath)) === undefined) return [];
    return [...parseJournalEvents(await readFileOrUndefined(fs, runFilePath))]
      .sort((left, right) => left.seq - right.seq);
  }

  return {
    kind: JOURNAL_BACKEND_KIND.APPENDABLE,

    async append(record: JournalEvent): Promise<void> {
      const result = await publishJsonlRecordAtomically(
        appendableJournalSequenceRecordPath(runFilePath, record.seq),
        toJsonRecord(record),
        {
          fs,
          randomBytes: options.randomBytes,
          publicationGuard: async () =>
            !(await markerExists(fs, sealingMarkerPath))
            && !(await markerExists(fs, sealMarkerPath)),
        },
      );
      if (!result.ok) {
        if (result.error === STATE_STORE_ERROR.RECORD_ALREADY_EXISTS) {
          throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
        }
        if (result.error === STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED) {
          throw new Error(JOURNAL_ERROR.SEALED);
        }
        throw new Error(result.error);
      }
      const sequenceRecordPath = appendableJournalSequenceRecordPath(runFilePath, record.seq);
      cachedSequenceEvents.set(record.seq, record);
      inspectedSequenceRecordPaths.add(sequenceRecordPath);
    },

    readAll,

    async seal(): Promise<void> {
      await fs.mkdir(dirname(sealMarkerPath), { recursive: true });
      if (await markerExists(fs, sealMarkerPath)) {
        await removeFileBestEffort(fs, sealingMarkerPath);
        return;
      }
      await fs.writeFile(sealingMarkerPath, APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);
      await ensureCreationMarker(fs, runFilePath, creationMarkerPath);
      await removeTemporaryPublications(fs, `${runFilePath}${SEQUENCE_RECORD_MARKER}`);
      await removeTemporaryPublications(fs, aggregateTemporaryPrefix(runFilePath));
      const events = await readSequenceEvents(await listSequenceRecords(fs, runFilePath));
      await replaceAggregateAtomically(
        fs,
        runFilePath,
        events.map((event) => serializeJsonlRecord(toJsonRecord(event))).join(""),
        options.randomBytes ?? nodeRandomBytes,
      );
      await fs.writeFile(sealMarkerPath, APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);
      await removeFileBestEffort(fs, sealingMarkerPath);
    },

    async isSealed(): Promise<boolean> {
      return (await readFileOrUndefined(fs, sealMarkerPath)) !== undefined;
    },
  };
}

async function ensureCreationMarker(
  fs: StateStoreFileSystem,
  runFilePath: string,
  creationMarkerPath: string,
): Promise<void> {
  try {
    await fs.link(runFilePath, creationMarkerPath);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) return;
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return;
    throw error;
  }
}

async function removeTemporaryPublications(
  fs: StateStoreFileSystem,
  destinationPathPrefix: string,
): Promise<void> {
  const result = await removeAtomicJsonlTemporaryFiles(destinationPathPrefix, { fs });
  if (!result.ok) throw new Error(result.error);
}

async function replaceAggregateAtomically(
  fs: StateStoreFileSystem,
  runFilePath: string,
  content: string,
  randomBytes: RandomBytes,
): Promise<void> {
  await writeFileAtomic(runFilePath, content, {
    fs,
    randomBytes,
    temporaryPath: aggregateTemporaryPath,
    exclusiveCreate: {
      maxAttempts: AGGREGATE_TEMPORARY_CREATE_ATTEMPTS,
      isCollision: (error) => hasErrorCode(error, ERROR_CODE_FILE_EXISTS),
    },
  });
}

function aggregateTemporaryPrefix(runFilePath: string): string {
  return `${runFilePath}${AGGREGATE_TEMPORARY_MARKER}`;
}

function aggregateTemporaryPath(runFilePath: string, randomBytes: RandomBytes): string {
  return `${aggregateTemporaryPrefix(runFilePath)}.${
    randomBytes(AGGREGATE_TEMPORARY_ID_BYTES).toString("hex")
  }${ATOMIC_TEMPORARY_SUFFIX}`;
}

async function markerExists(fs: StateStoreFileSystem, path: string): Promise<boolean> {
  return (await readFileOrUndefined(fs, path)) !== undefined;
}

async function removeFileBestEffort(fs: StateStoreFileSystem, path: string): Promise<void> {
  try {
    await fs.rm(path, { force: true });
  } catch {
    // A committed seal remains valid when recovery-marker cleanup is interrupted.
  }
}

function parseJournalEvents(content: string | undefined): readonly JournalEvent[] {
  if (content === undefined) return [];
  const events: JournalEvent[] = [];
  for (const line of content.split(LINE_SEPARATOR)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!checkJournalEventConformance(parsed).ok) continue;
    events.push(parsed as JournalEvent);
  }
  return events;
}

async function listSequenceRecords(
  fs: StateStoreFileSystem,
  runFilePath: string,
): Promise<readonly SequenceRecordAddress[]> {
  const directory = dirname(runFilePath);
  const prefix = `${basename(runFilePath)}${SEQUENCE_RECORD_MARKER}`;
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return [];
    throw error;
  }
  const records: SequenceRecordAddress[] = [];
  for (const entry of entries) {
    const sequence = entry.isFile() ? sequenceFromRecordName(entry.name, prefix) : undefined;
    if (sequence !== undefined) {
      records.push({ path: join(directory, entry.name), sequence });
    }
  }
  return records;
}

function sequenceFromRecordName(name: string, prefix: string): number | undefined {
  if (!name.startsWith(prefix) || !name.endsWith(SEQUENCE_RECORD_SUFFIX)) return undefined;
  const token = name.slice(prefix.length, -SEQUENCE_RECORD_SUFFIX.length);
  return SEQUENCE_TOKEN_PATTERN.test(token) ? Number(token) : undefined;
}

function toJsonRecord(event: JournalEvent): JsonRecord {
  return {
    id: event.id,
    source: event.source,
    type: event.type,
    specversion: event.specversion,
    time: event.time,
    streamid: event.streamid,
    seq: event.seq,
    runid: event.runid,
    attempt: event.attempt,
    ...(event.data === undefined ? {} : { data: event.data }),
  };
}

async function readFileOrUndefined(fs: StateStoreFileSystem, path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, STATE_STORE_TEXT_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return undefined;
    throw error;
  }
}
