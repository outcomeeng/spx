import type { Result } from "@/config/types";
import { journalRunFilePath } from "@/domains/journal/run-scope";
import { createJournal, type JournalEvent, type JournalEventInput, type Projection } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { branchScopeDir, createJsonlRunFile, runFileName, type StateStoreFileSystem } from "@/lib/state-store";

export const JOURNAL_RUNTIME_ERROR = {
  APPEND_FAILED: "journal append failed",
  READ_FAILED: "journal read failed",
  SEAL_FAILED: "journal seal failed",
  RENDER_FAILED: "journal render failed",
} as const;

export type JournalRuntimeErrorCode = (typeof JOURNAL_RUNTIME_ERROR)[keyof typeof JOURNAL_RUNTIME_ERROR];

/**
 * A sink that receives each appended event for the run's streaming surface.
 * The descriptor binds it to standard output under the local backend; the
 * command layer never writes to the process boundary itself.
 */
export interface JournalStreamSink {
  emit(event: JournalEvent): Promise<void>;
}

/** The scope that addresses one journal run: branch slug, opaque type, and run token. */
export interface JournalRunRef {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
  readonly runToken: string;
}

/** The scope that opens a new journal run, before its run token is assigned. */
export interface JournalRunScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
}

export interface OpenJournalRunOptions {
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface JournalRunHandle {
  readonly ref: JournalRunRef;
  readonly runFilePath: string;
  readonly runFileName: string;
}

export interface JournalVerbOptions {
  readonly fs?: StateStoreFileSystem;
}

function bindRunFilePath(ref: JournalRunRef): Result<string> {
  return journalRunFilePath({
    productDir: ref.productDir,
    branchSlug: ref.branchSlug,
    type: ref.type,
    runToken: ref.runToken,
  });
}

function bindJournal(ref: JournalRunRef, fs?: StateStoreFileSystem) {
  const runFilePath = bindRunFilePath(ref);
  if (!runFilePath.ok) return runFilePath;
  const name = runFileName(ref.runToken);
  const backend = createAppendableJournalStore({ runFilePath: runFilePath.value, ...(fs === undefined ? {} : { fs }) });
  const journal = createJournal(backend, { streamid: name, runid: name });
  return { ok: true as const, value: { journal, runFilePath: runFilePath.value, runFileName: name } };
}

/**
 * Open a new journal run: create its append-only run file under
 * `.spx/branch/<branch-slug>/<type>/runs/` and return the scope that addresses it.
 */
export async function openJournalRun(
  scope: JournalRunScope,
  options: OpenJournalRunOptions = {},
): Promise<Result<JournalRunHandle>> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  const runFile = await createJsonlRunFile(branchScope.value, scope.type, {
    ...(options.fs === undefined ? {} : { fs: options.fs }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.randomBytes === undefined ? {} : { randomBytes: options.randomBytes }),
  });
  if (!runFile.ok) return runFile;
  return {
    ok: true,
    value: {
      ref: {
        productDir: scope.productDir,
        branchSlug: scope.branchSlug,
        type: scope.type,
        runToken: runFile.value.runToken,
      },
      runFilePath: runFile.value.runFilePath,
      runFileName: runFile.value.runFileName,
    },
  };
}

/**
 * Append an event to a run's journal and emit it to the streaming sink, so the
 * run both persists the event and is observable as it advances.
 */
export async function appendJournalEvent(
  ref: JournalRunRef,
  input: JournalEventInput,
  sink: JournalStreamSink,
  options: JournalVerbOptions = {},
): Promise<Result<JournalEvent>> {
  const bound = bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    const event = await bound.value.journal.append(input);
    await sink.emit(event);
    return { ok: true, value: event };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.APPEND_FAILED}: ${toMessage(error)}` };
  }
}

/** Read a run's events at or after `fromCursor`, oldest first. */
export async function readJournalEvents(
  ref: JournalRunRef,
  fromCursor: number,
  options: JournalVerbOptions = {},
): Promise<Result<readonly JournalEvent[]>> {
  const bound = bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    return { ok: true, value: await bound.value.journal.read(fromCursor) };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.READ_FAILED}: ${toMessage(error)}` };
  }
}

/** Seal a run's journal; further appends are rejected. */
export async function sealJournalRun(
  ref: JournalRunRef,
  options: JournalVerbOptions = {},
): Promise<Result<void>> {
  const bound = bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    await bound.value.journal.seal();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.SEAL_FAILED}: ${toMessage(error)}` };
  }
}

/** Render a projection over a run's event prefix by replaying its history. */
export async function renderJournalRun<T>(
  ref: JournalRunRef,
  projection: Projection<T>,
  options: JournalVerbOptions = {},
): Promise<Result<T>> {
  const bound = bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    return { ok: true, value: await bound.value.journal.render(projection) };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.RENDER_FAILED}: ${toMessage(error)}` };
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
