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
  hasErrorCode,
  type JsonRecord,
  type StateStoreFileSystem,
} from "@/lib/state-store";

const SEAL_MARKER_SUFFIX = ".sealed";
const NOT_FOUND_CODE = "ENOENT";
const LINE_SEPARATOR = "\n";
const UTF8 = "utf8";

export interface AppendableJournalStoreOptions {
  /** The resolved `.spx/` run file path that holds this stream's JSONL history. */
  readonly runFilePath: string;
  /** Injected filesystem; defaults to the real state-store filesystem. */
  readonly fs?: StateStoreFileSystem;
}

/** Bind the agent-run-journal `AppendableBackend` port to a JSONL run file on an injected filesystem. */
export function createAppendableJournalStore(options: AppendableJournalStoreOptions): AppendableBackend {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const { runFilePath } = options;
  const sealMarkerPath = `${runFilePath}${SEAL_MARKER_SUFFIX}`;

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
      const history = await readAll();
      if (history.some((event) => event.seq === record.seq)) {
        throw new Error(JOURNAL_ERROR.SEQ_CONSUMED);
      }
      const result = await appendJsonlRecord(runFilePath, toJsonRecord(record), { fs });
      if (!result.ok) throw new Error(result.error);
    },

    readAll,

    async seal(): Promise<void> {
      await fs.mkdir(dirname(sealMarkerPath), { recursive: true });
      await fs.writeFile(sealMarkerPath, "");
    },

    async isSealed(): Promise<boolean> {
      return (await readFileOrUndefined(fs, sealMarkerPath)) !== undefined;
    },
  };
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
    return await fs.readFile(path, UTF8);
  } catch (error) {
    if (hasErrorCode(error, NOT_FOUND_CODE)) return undefined;
    throw error;
  }
}
