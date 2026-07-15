import { dirname } from "node:path";

import {
  type AppendableBackend,
  checkJournalEventConformance,
  JOURNAL_BACKEND_KIND,
  JOURNAL_ERROR,
  type JournalEvent,
} from "@/lib/agent-run-journal";
import {
  appendJsonlRecord,
  defaultStateStoreFileSystem,
  ERROR_CODE_FILE_EXISTS,
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  hasErrorCode,
  type JsonRecord,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";

const SEAL_MARKER_SUFFIX = ".sealed";
const SEQUENCE_CLAIM_MARKER_PREFIX = ".seq-";
const SEQUENCE_CLAIM_MARKER_SUFFIX = ".claimed";
export const APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT = "";
export const APPENDABLE_JOURNAL_SEQUENCE_CLAIM_MARKER_CONTENT = "";
const LINE_SEPARATOR = "\n";

export interface AppendableJournalStoreOptions {
  /** The resolved `.spx/` run file path that holds this stream's JSONL history. */
  readonly runFilePath: string;
  /** Injected filesystem; defaults to the real state-store filesystem. */
  readonly fs?: StateStoreFileSystem;
}

export function appendableJournalSealMarkerPath(runFilePath: string): string {
  return `${runFilePath}${SEAL_MARKER_SUFFIX}`;
}

export function appendableJournalSequenceClaimPath(runFilePath: string, sequence: number): string {
  return `${runFilePath}${SEQUENCE_CLAIM_MARKER_PREFIX}${sequence}${SEQUENCE_CLAIM_MARKER_SUFFIX}`;
}

/** Bind the agent-run-journal `AppendableBackend` port to a JSONL run file on an injected filesystem. */
export function createAppendableJournalStore(options: AppendableJournalStoreOptions): AppendableBackend {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const { runFilePath } = options;
  const sealMarkerPath = appendableJournalSealMarkerPath(runFilePath);

  async function readAll(): Promise<readonly JournalEvent[]> {
    const content = await readFileOrUndefined(fs, runFilePath);
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
      // a syntactically valid line that is not a conformant event is the same
      // class of defect as a parse failure — skip it rather than emit a counterfeit
      if (!checkJournalEventConformance(parsed).ok) continue;
      events.push(parsed as JournalEvent);
    }
    return [...events].sort((left, right) => left.seq - right.seq);
  }

  return {
    kind: JOURNAL_BACKEND_KIND.APPENDABLE,

    async append(record: JournalEvent): Promise<void> {
      const sequenceClaimPath = await claimSequence(fs, runFilePath, record.seq);
      const result = await appendJsonlRecord(runFilePath, toJsonRecord(record), { fs });
      if (!result.ok) {
        await fs.rm(sequenceClaimPath, { force: true });
        throw new Error(result.error);
      }
    },

    readAll,

    async seal(): Promise<void> {
      await fs.mkdir(dirname(sealMarkerPath), { recursive: true });
      await fs.writeFile(sealMarkerPath, APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);
    },

    async isSealed(): Promise<boolean> {
      return (await readFileOrUndefined(fs, sealMarkerPath)) !== undefined;
    },
  };
}

async function claimSequence(
  fs: StateStoreFileSystem,
  runFilePath: string,
  sequence: number,
): Promise<string> {
  const sequenceClaimPath = appendableJournalSequenceClaimPath(runFilePath, sequence);
  await fs.mkdir(dirname(sequenceClaimPath), { recursive: true });
  try {
    await fs.writeFile(sequenceClaimPath, APPENDABLE_JOURNAL_SEQUENCE_CLAIM_MARKER_CONTENT, {
      flag: EXCLUSIVE_CREATE_FLAG,
    });
    return sequenceClaimPath;
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) {
      throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
    }
    throw error;
  }
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
