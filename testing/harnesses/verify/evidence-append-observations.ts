import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyStartCommand,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import { VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import {
  createDelegatingStateStoreFileSystem,
  createInMemoryStateStoreFileSystem,
} from "@testing/harnesses/state/in-memory-file-system";
import {
  createRecordingStreamSink,
  createVerifyRunContextScenario,
  parseStartReport,
  readVerifyRunEvents,
  verifyAppendDeps,
  type VerifyAppendScenarioEnv,
  verifyInputRecordFilePath,
  type VerifyRunContextScenario,
  verifyStartOptions,
  type VerifyStateStoreFileSystem,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

/**
 * Setup and observation for the evidence-append tests. Each function opens a store, starts a run,
 * drives a setup step, or reads what a run recorded, and returns the observation; the linked test
 * file judges every observation. No function here holds a pass/fail predicate.
 */

/** Both evidence-append verbs: scope evidence and finding evidence. */
export const VERIFY_EVIDENCE_APPEND_COMMANDS = [verifyAppendScopeCommand, verifyAppendFindingCommand] as const;

/** A run-context scenario whose verification type is `review`, the type with finding-evidence schema. */
export function reviewRunScenario(): VerifyRunContextScenario {
  return withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW);
}

/** An append fixture whose run start has been attempted, carrying the start result for the test to judge. */
export interface AttemptedAppendRun extends VerifyAppendScenarioEnv {
  readonly started: CliCommandResult;
  /** The started run's token; empty when the start did not succeed. */
  readonly runToken: string;
}

/**
 * Start a run for `scenario` over a fresh in-memory store (or the supplied one) with the append deps,
 * composing `deps` overrides onto them, and return the start result beside the fixture.
 */
export async function attemptAppendRun(
  scenario: VerifyRunContextScenario,
  options: { readonly fs?: VerifyStateStoreFileSystem; readonly deps?: Partial<VerifyCliDeps> } = {},
): Promise<AttemptedAppendRun> {
  const fs = options.fs ?? createInMemoryStateStoreFileSystem();
  const sink = createRecordingStreamSink();
  const deps: VerifyCliDeps = { ...verifyAppendDeps(scenario, fs, sink.sink), ...options.deps };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  const runToken = started.exitCode === VERIFY_CLI_EXIT_CODE.OK ? parseStartReport(started.output).runToken : "";
  return { scenario, fs, sink, deps, started, runToken };
}

/** Every event the run's journal holds, read through the real journal substrate. */
export function runEvents(run: AttemptedAppendRun): Promise<readonly JournalEvent[]> {
  return readVerifyRunEvents(run.scenario, run.runToken, run.fs);
}

/** The events of one type among `events`, in journal order. */
export function eventsOfType(events: readonly JournalEvent[], eventType: string): readonly JournalEvent[] {
  return events.filter((event) => event.type === eventType);
}

/** The changeset scope of `scenario` with its base and head swapped: a selector the recorded run does not carry. */
export function reversedChangesetScope(scenario: VerifyRunContextScenario): string {
  return `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`;
}

/** Remove a started run's recorded-input sidecar from the store. */
export async function removeRecordedInputSidecar(run: AttemptedAppendRun): Promise<void> {
  await run.fs.rm(verifyInputRecordFilePath(run.scenario, run.runToken), { force: true });
}

/** Overwrite a started run's recorded-input sidecar with a record whose scope selector is reversed. */
export async function writeReversedScopeInputSidecar(run: AttemptedAppendRun): Promise<void> {
  await run.fs.writeFile(
    verifyInputRecordFilePath(run.scenario, run.runToken),
    JSON.stringify({
      scopeIdentity: reversedChangesetScope(run.scenario),
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      source: run.scenario.inputContent,
      digest: run.runToken,
      content: run.scenario.inputContent,
    }),
  );
}

/** An in-memory store that records the path of every file written or renamed into place. */
export interface WriteRecordingFileSystem {
  readonly fs: VerifyStateStoreFileSystem;
  /** The paths written or renamed into, oldest first, without repeats. */
  writtenPaths(): readonly string[];
}

export function createWriteRecordingFileSystem(): WriteRecordingFileSystem {
  const delegate = createInMemoryStateStoreFileSystem();
  const written: string[] = [];
  const record = (path: string): void => {
    if (!written.includes(path)) written.push(path);
  };
  const fs = createDelegatingStateStoreFileSystem(delegate, {
    writeFile: async (path, data, options) => {
      await delegate.writeFile(path, data, options);
      record(path);
    },
    appendFile: async (path, data) => {
      await delegate.appendFile(path, data);
      record(path);
    },
    rename: async (from, to) => {
      await delegate.rename(from, to);
      record(to);
    },
  });
  return { fs, writtenPaths: () => [...written] };
}

/** The recorded written paths whose file still exists in the store and whose text contains `text`. */
export async function writtenPathsHolding(
  recording: WriteRecordingFileSystem,
  text: string,
): Promise<readonly string[]> {
  const holding: string[] = [];
  for (const path of recording.writtenPaths()) {
    const content = await recording.fs.readFile(path, STATE_STORE_TEXT_ENCODING).catch(() => undefined);
    if (content?.includes(text) === true) holding.push(path);
  }
  return holding;
}
