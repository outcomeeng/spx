import type { Result } from "@/config/types";
import {
  journalBranchScopesDir,
  journalRunBranchSlugFromEntry,
  type JournalRunDirectoryScope,
  journalRunFileNameFromEntry,
  journalRunFilePath,
  type JournalRunListScope,
  type JournalRunMetadata,
  journalRunMetadataMatches,
  journalRunsDir,
  journalRunTerminalState,
  journalRunTypeFromEntry,
  type SealedJournalRun,
} from "@/domains/journal/run-scope";
import { createJournal, type JournalEvent, type JournalEventInput, type Projection } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { toMessage } from "@/lib/error-message";
import {
  branchScopeDir,
  compareAsciiStrings,
  compareRunRecencyNewestFirst,
  compareRunRecencyOldestFirst,
  createJsonlRunFile,
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  runFileName,
  runTokenStartedAt,
  type StateStoreFileSystem,
  validateBranchSlug,
  validateScopeToken,
} from "@/lib/state-store";

export const JOURNAL_RUNTIME_ERROR = {
  APPEND_FAILED: "journal append failed",
  READ_FAILED: "journal read failed",
  SEAL_FAILED: "journal seal failed",
  RENDER_FAILED: "journal render failed",
  RUN_NOT_FOUND: "journal run not found; open the run before operating on it",
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

export interface JournalListRunsScope extends JournalRunListScope {
  readonly limit: number;
}

export interface JournalSealedRunSetScope extends JournalRunDirectoryScope {
  readonly eventLimit: number;
  readonly limit: number;
}

export interface JournalRunTokenLookupScope {
  readonly productDir: string;
  readonly branchSlug?: string;
  readonly type: string;
  readonly runToken: string;
}

function applyJournalRunListLimit(
  runs: readonly JournalRunMetadata[],
  limit: number,
): readonly JournalRunMetadata[] {
  return runs.slice(0, limit);
}

function bindRunFilePath(ref: JournalRunRef): Result<string> {
  return journalRunFilePath({
    productDir: ref.productDir,
    branchSlug: ref.branchSlug,
    type: ref.type,
    runToken: ref.runToken,
  });
}

async function runFileExists(fs: StateStoreFileSystem, runFilePath: string): Promise<boolean> {
  try {
    return (await fs.lstat(runFilePath)).isFile();
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return false;
    throw error;
  }
}

async function directoryEntries(
  fs: StateStoreFileSystem,
  directory: string,
): Promise<Result<readonly { readonly name: string; isFile(): boolean }[]>> {
  try {
    return { ok: true, value: await fs.readdir(directory, { withFileTypes: true }) };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: [] };
    return { ok: false, error: toMessage(error) };
  }
}

async function branchSlugs(scope: JournalRunListScope, fs: StateStoreFileSystem): Promise<Result<readonly string[]>> {
  if (scope.branchSlug !== undefined) {
    const validated = validateBranchSlug(scope.branchSlug);
    if (!validated.ok) return validated;
    return { ok: true, value: [validated.value] };
  }

  const root = journalBranchScopesDir(scope.productDir);
  const entries = await directoryEntries(fs, root);
  if (!entries.ok) return entries;
  const slugs: string[] = [];
  for (const entry of entries.value) {
    const slug = journalRunBranchSlugFromEntry(entry.name, !entry.isFile());
    if (slug !== undefined) slugs.push(slug);
  }
  return { ok: true, value: slugs.sort(compareAsciiStrings) };
}

async function journalTypes(
  productDir: string,
  branchSlug: string,
  type: string | undefined,
  fs: StateStoreFileSystem,
): Promise<Result<readonly string[]>> {
  const branchScope = branchScopeDir(productDir, branchSlug);
  if (!branchScope.ok) return branchScope;
  if (type !== undefined) {
    const validated = validateScopeToken(type);
    if (!validated.ok) return validated;
    return { ok: true, value: [validated.value] };
  }

  const entries = await directoryEntries(fs, branchScope.value);
  if (!entries.ok) return entries;
  const types: string[] = [];
  for (const entry of entries.value) {
    const journalType = journalRunTypeFromEntry(entry.name, !entry.isFile());
    if (journalType !== undefined) types.push(journalType);
  }
  return { ok: true, value: types.sort(compareAsciiStrings) };
}

async function readRunMetadata(
  productDir: string,
  branchSlug: string,
  type: string,
  runFileNameValue: { readonly runFileName: string; readonly runToken: string },
  fs: StateStoreFileSystem,
): Promise<Result<{ readonly metadata: JournalRunMetadata; readonly events: readonly JournalEvent[] }>> {
  const { runFileName, runToken } = runFileNameValue;
  const runFile = journalRunFilePath({ productDir, branchSlug, type, runToken });
  if (!runFile.ok) return runFile;
  const store = createAppendableJournalStore({ runFilePath: runFile.value, fs });
  try {
    const [events, sealed, stats] = await Promise.all([store.readAll(), store.isSealed(), fs.lstat(runFile.value)]);
    const metadata: JournalRunMetadata = {
      productDir,
      branchSlug,
      type,
      runToken,
      runFilePath: runFile.value,
      runFileName,
      startedAt: runTokenStartedAt(runToken),
      createdAtMs: stats.birthtimeMs,
      sealed,
      eventCount: events.length,
      terminalState: journalRunTerminalState(events, sealed),
    };
    return { ok: true, value: { metadata, events } };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.READ_FAILED}: ${toMessage(error)}` };
  }
}

async function runsForType(
  scope: JournalRunListScope,
  branchSlug: string,
  type: string,
  fs: StateStoreFileSystem,
): Promise<Result<readonly JournalRunMetadata[]>> {
  const typeRunsDir = journalRunsDir({ productDir: scope.productDir, branchSlug, type });
  if (!typeRunsDir.ok) return typeRunsDir;
  const entries = await directoryEntries(fs, typeRunsDir.value);
  if (!entries.ok) return entries;

  const runs: JournalRunMetadata[] = [];
  for (const entry of entries.value) {
    const runFileNameValue = journalRunFileNameFromEntry(entry.name, entry.isFile());
    if (runFileNameValue === undefined) continue;
    const run = await readRunMetadata(scope.productDir, branchSlug, type, runFileNameValue, fs);
    if (!run.ok) return run;
    if (journalRunMetadataMatches(scope, run.value.metadata)) runs.push(run.value.metadata);
  }
  return { ok: true, value: runs };
}

async function runsForBranch(
  scope: JournalRunListScope,
  branchSlug: string,
  fs: StateStoreFileSystem,
): Promise<Result<readonly JournalRunMetadata[]>> {
  const types = await journalTypes(scope.productDir, branchSlug, scope.type, fs);
  if (!types.ok) return types;

  const runs: JournalRunMetadata[] = [];
  for (const type of types.value) {
    const typeRuns = await runsForType(scope, branchSlug, type, fs);
    if (!typeRuns.ok) return typeRuns;
    runs.push(...typeRuns.value);
  }
  return { ok: true, value: runs };
}

/**
 * Bind the journal contract to a run that `open` already created. The four
 * operate-verbs require the run file to exist so a mistyped or never-opened run
 * token is rejected rather than silently creating a phantom run that reads back
 * empty; `open` mints the token and creates the file, so it never binds here.
 */
async function bindJournal(ref: JournalRunRef, fs?: StateStoreFileSystem) {
  const runFilePath = bindRunFilePath(ref);
  if (!runFilePath.ok) return runFilePath;
  const fileSystem = fs ?? defaultStateStoreFileSystem;
  if (!(await runFileExists(fileSystem, runFilePath.value))) {
    return { ok: false as const, error: JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND };
  }
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
  scope: JournalRunDirectoryScope,
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

export async function listJournalRuns(
  scope: JournalListRunsScope,
  options: JournalVerbOptions = {},
): Promise<Result<readonly JournalRunMetadata[]>> {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const branches = await branchSlugs(scope, fs);
  if (!branches.ok) return branches;
  const runs: JournalRunMetadata[] = [];
  for (const branchSlug of branches.value) {
    const branchRuns = await runsForBranch(scope, branchSlug, fs);
    if (!branchRuns.ok) return branchRuns;
    runs.push(...branchRuns.value);
  }
  const sorted = runs.sort(compareRunRecencyNewestFirst);
  return { ok: true, value: applyJournalRunListLimit(sorted, scope.limit) };
}

export async function readSealedJournalRunSet(
  scope: JournalSealedRunSetScope,
  options: JournalVerbOptions = {},
): Promise<Result<readonly SealedJournalRun[]>> {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const typeRunsDir = journalRunsDir(scope);
  if (!typeRunsDir.ok) return typeRunsDir;
  const entries = await directoryEntries(fs, typeRunsDir.value);
  if (!entries.ok) return entries;
  const runs: Array<{ readonly metadata: JournalRunMetadata; readonly events: readonly JournalEvent[] }> = [];
  for (const entry of entries.value) {
    const runFileNameValue = journalRunFileNameFromEntry(entry.name, entry.isFile());
    if (runFileNameValue === undefined) continue;
    const run = await readRunMetadata(scope.productDir, scope.branchSlug, scope.type, runFileNameValue, fs);
    if (!run.ok) return run;
    if (run.value.metadata.sealed) runs.push(run.value);
  }
  return {
    ok: true,
    value: runs
      .sort((left, right) => compareRunRecencyNewestFirst(left.metadata, right.metadata))
      .slice(0, scope.limit)
      .sort((left, right) => compareRunRecencyOldestFirst(left.metadata, right.metadata))
      .map((run) => ({
        runToken: run.metadata.runToken,
        metadata: run.metadata,
        events: run.events.slice(0, scope.eventLimit),
      })),
  };
}

/** Return branch scopes that contain the requested run token for one opaque type. */
export async function findJournalRunBranchSlugs(
  scope: JournalRunTokenLookupScope,
  options: JournalVerbOptions = {},
): Promise<Result<readonly string[]>> {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const branches = await branchSlugs(scope, fs);
  if (!branches.ok) return branches;
  const matches: string[] = [];
  for (const branchSlug of branches.value) {
    const runFilePath = bindRunFilePath({ ...scope, branchSlug });
    if (!runFilePath.ok) return runFilePath;
    if (await runFileExists(fs, runFilePath.value)) matches.push(branchSlug);
  }
  return { ok: true, value: matches };
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
  const bound = await bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  let event: JournalEvent;
  try {
    event = await bound.value.journal.append(input);
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.APPEND_FAILED}: ${toMessage(error)}` };
  }
  // The event is durably recorded. Streaming is best-effort: reporting a failure
  // here would make the caller retry and append the same event again at the next
  // sequence, duplicating a committed fact. Under the github-pr backend the next
  // append re-renders and upserts the full projection, superseding a missed
  // intermediate emit; the local backend streams individual events to standard output.
  try {
    await sink.emit(event);
  } catch {
    // best-effort streaming surface; the committed event stands
  }
  return { ok: true, value: event };
}

/** Read a run's events at or after `fromCursor`, oldest first. */
export async function readJournalEvents(
  ref: JournalRunRef,
  fromCursor: number,
  options: JournalVerbOptions = {},
): Promise<Result<readonly JournalEvent[]>> {
  const bound = await bindJournal(ref, options.fs);
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
  const bound = await bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    await bound.value.journal.seal();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.SEAL_FAILED}: ${toMessage(error)}` };
  }
}

/** Report a run's physical seal-marker state without reading sibling runs. */
export async function isJournalRunSealed(
  ref: JournalRunRef,
  options: JournalVerbOptions = {},
): Promise<Result<boolean>> {
  const runFilePath = bindRunFilePath(ref);
  if (!runFilePath.ok) return runFilePath;
  const fs = options.fs ?? defaultStateStoreFileSystem;
  if (!(await runFileExists(fs, runFilePath.value))) {
    return { ok: false, error: JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND };
  }
  const store = createAppendableJournalStore({ runFilePath: runFilePath.value, fs });
  try {
    return { ok: true, value: await store.isSealed() };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.READ_FAILED}: ${toMessage(error)}` };
  }
}

/** Render a projection over a run's event prefix by replaying its history. */
export async function renderJournalRun<T>(
  ref: JournalRunRef,
  projection: Projection<T>,
  options: JournalVerbOptions = {},
): Promise<Result<T>> {
  const bound = await bindJournal(ref, options.fs);
  if (!bound.ok) return bound;
  try {
    return { ok: true, value: await bound.value.journal.render(projection) };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_RUNTIME_ERROR.RENDER_FAILED}: ${toMessage(error)}` };
  }
}
