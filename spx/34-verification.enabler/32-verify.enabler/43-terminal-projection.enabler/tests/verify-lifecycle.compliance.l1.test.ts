import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { journalOpenCommand } from "@/commands/journal/cli";
import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyFinishCommand, verifyStartCommand } from "@/commands/verify/cli";
import {
  findTerminalEvent,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
  type VerifyAppendEventType,
} from "@/domains/verify/verify";
import type { JournalEvent } from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
} from "@/lib/appendable-journal-store";
import { STATE_STORE_TEXT_ENCODING, type StateStoreFileSystem } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  createRecordingGitDeps,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRecoversUnsealedRun,
  finishRun,
  parseFinishReport,
  parseStartReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyDeps,
  verifyFinishOptions,
  verifyInputRecordFilePath,
  verifyStartOptions,
  type VerifyStateStoreFileSystem,
} from "@testing/harnesses/verify/harness";

interface SealRetryFileSystem extends StateStoreFileSystem {
  failDirectoryListings(): void;
  failFirstSealWriteAt(path: string): void;
}

interface RawJournalOpenReport {
  readonly runToken: string;
}

interface ExpectedTerminalProjection {
  readonly runToken: string;
  readonly terminalStatus: string;
  readonly sealed: true;
  readonly findingCount: number;
  readonly lastSequence: number;
}

function parseRawJournalOpenReport(output: string): RawJournalOpenReport {
  return JSON.parse(output) as RawJournalOpenReport;
}

function countEventsOfType(events: readonly JournalEvent[], eventType: VerifyAppendEventType): number {
  return events.filter((event) => event.type === eventType).length;
}

function lastObservedSequence(events: readonly JournalEvent[]): number {
  return Math.max(...events.map((event) => event.seq));
}

async function expectedTerminalProjectionFromJournal(
  scenario: ReturnType<typeof createVerifyRunContextScenario>,
  fs: VerifyStateStoreFileSystem,
  runToken: string,
  terminalStatus: string,
): Promise<ExpectedTerminalProjection> {
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  return {
    runToken,
    terminalStatus,
    sealed: true,
    findingCount: countEventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING),
    lastSequence: lastObservedSequence(events),
  };
}

function expectFinishReportMatchesJournal(
  report: ReturnType<typeof parseFinishReport>,
  expected: ExpectedTerminalProjection,
): void {
  expect(report.runToken).toBe(expected.runToken);
  expect(report.terminalStatus).toBe(expected.terminalStatus);
  expect(report.sealed).toBe(expected.sealed);
  expect(report.findingCount).toBe(expected.findingCount);
  expect(report.lastSequence).toBe(expected.lastSequence);
}

function createSealRetryFileSystem(): SealRetryFileSystem {
  const fs = createInMemoryStateStoreFileSystem();
  let blockedSealMarkerPath: string | undefined;
  let directoryListingsRejected = false;
  let sealFailuresRemaining = 0;
  return {
    appendFile: (path, data) => fs.appendFile(path, data),
    failDirectoryListings: () => {
      directoryListingsRejected = true;
    },
    failFirstSealWriteAt: (path: string) => {
      blockedSealMarkerPath = path;
      sealFailuresRemaining = 1;
    },
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => fs.readFile(path, encoding),
    readdir: async (path, options) => {
      if (directoryListingsRejected) {
        throw new Error("verify harness: directory listing rejected");
      }
      return fs.readdir(path, options);
    },
    rename: (from, to) => fs.rename(from, to),
    rm: (path, options) => fs.rm(path, options),
    writeFile: async (path, data, options) => {
      if (path === blockedSealMarkerPath && sealFailuresRemaining > 0) {
        sealFailuresRemaining -= 1;
        throw new Error("verify harness: first seal write rejected");
      }
      await fs.writeFile(path, data, options);
    },
  };
}

describe("verify finish compliance", () => {
  it("rejects a blank terminal status without recording completion or sealing", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const runToken = startReport.runToken;
    const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankTerminalStatus(), async (blankStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(scenario, { run: runToken, terminalStatus: blankStatus }),
          deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_REQUIRED);
      }),
    );

    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
    await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    // The rejected finishes neither record terminal completion nor seal: a valid finish still succeeds.
    await finishRecoversUnsealedRun(scenario, deps, runToken);
  });

  it("rejects a terminal status outside the journal terminal-status vocabulary", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const runToken = startReport.runToken;
    const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.invalidTerminalStatus(), async (invalidStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(scenario, { run: runToken, terminalStatus: invalidStatus }),
          deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID);
      }),
    );

    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
    await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    // The rejected finishes neither record terminal completion nor seal: a valid finish still succeeds.
    await finishRecoversUnsealedRun(scenario, deps, runToken);
  });

  it("returns the existing terminal projection for a repeated finish without appending a second terminal event", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const first = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const repeat = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    expectFinishReportMatchesJournal(
      parseFinishReport(repeat.output),
      await expectedTerminalProjectionFromJournal(scenario, fs, runToken, terminalStatus),
    );
    const terminalEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_TERMINAL_EVENT_TYPE,
    );
    expect(terminalEvents).toHaveLength(1);
  });

  it("retries the physical journal seal without listing sibling runs when repeated finish finds terminal completion unsealed", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createSealRetryFileSystem();
    const deps = createVerifyAppendScenario(scenario).deps;
    const retryDeps = { ...deps, fs };
    const started = await verifyStartCommand(verifyStartOptions(scenario), retryDeps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
    fs.failFirstSealWriteAt(sealMarkerPath);

    const first = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
      retryDeps,
    );
    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(first.output).toContain(VERIFY_CLI_ERROR.SEAL_FAILED);
    expect(findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs))).toBeDefined();
    await fs.rm(verifyInputRecordFilePath(scenario, startReport.runToken), { force: true });
    fs.failDirectoryListings();

    const repeat = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
      retryDeps,
    );

    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(repeat.output).terminalStatus).toBe(terminalStatus);
    await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(
      APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
    );
  });

  it("rejects an unterminal raw journal run without a recorded verification input", async () => {
    const scenario = createVerifyRunContextScenario();
    const { fs, deps } = createVerifyAppendScenario(scenario);
    const opened = await journalOpenCommand({ type: scenario.verificationType }, deps);
    expect(opened.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const rawRun = parseRawJournalOpenReport(opened.output);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const finished = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: rawRun.runToken, terminalStatus }),
      deps,
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toContain(rawRun.runToken);
    expect(finished.output).toContain(verifyInputRecordFilePath(scenario, rawRun.runToken));
    expect(findTerminalEvent(await readVerifyRunEvents(scenario, rawRun.runToken, fs))).toBeUndefined();
  });

  it("returns the first terminal projection when a second finish supplies a different terminal status", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const statuses = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.distinctTerminalStatuses());

    await finishRun(scenario, deps, runToken, statuses.first);
    const second = await finishRun(scenario, deps, runToken, statuses.second);

    // First status wins: the second finish returns the recorded projection, not the new status.
    expect(second.terminalStatus).toBe(statuses.first);
    expectFinishReportMatchesJournal(
      second,
      await expectedTerminalProjectionFromJournal(scenario, fs, runToken, statuses.first),
    );
    const terminalEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_TERMINAL_EVENT_TYPE,
    );
    expect(terminalEvents).toHaveLength(1);
    expect(JSON.stringify(terminalEvents[0]?.data)).not.toContain(statuses.second);
  });

  it("returns the idempotent terminal projection without a journal binding", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);
    await fs.writeFile(
      verifyInputRecordFilePath(scenario, runToken),
      JSON.stringify({ source: terminalStatus, digest: runToken, content: scenario.inputContent }),
    );

    // The idempotent return is read-only, so journal history still projects without binding or sidecar.
    const readOnlyDeps = verifyDeps(scenario, fs);
    const repeat = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
      readOnlyDeps,
    );
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expectFinishReportMatchesJournal(
      parseFinishReport(repeat.output),
      await expectedTerminalProjectionFromJournal(scenario, fs, runToken, terminalStatus),
    );
  });

  it("rejects repeated finish when the recorded input selector differs from the requested scope", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const runToken = startReport.runToken;
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);
    await fs.writeFile(
      verifyInputRecordFilePath(scenario, runToken),
      JSON.stringify({
        scopeIdentity: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        source: VERIFY_INPUT_SOURCE.STDIN,
        digest: startReport.input.digest,
        content: scenario.inputContent,
      }),
    );

    const repeat = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);

    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(repeat.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    const terminalEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_TERMINAL_EVENT_TYPE,
    );
    expect(terminalEvents).toHaveLength(1);
  });

  it("rejects an unsupported scope type or a malformed changeset scope before mutating the run", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const runToken = startReport.runToken;
    const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const unsupportedType = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
        scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE,
      },
      deps,
    );
    expect(unsupportedType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(unsupportedType.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);

    const malformedScope = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
        scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()),
      },
      deps,
    );
    expect(malformedScope.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(malformedScope.output).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);

    // Rejected finishes neither record terminal completion nor seal: a valid finish still succeeds.
    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
    await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    await finishRecoversUnsealedRun(scenario, deps, runToken);
  });

  it("rejects an unsupported verification type before resolving an existing run to finish", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs = createInMemoryStateStoreFileSystem();
    const recorder = createRecordingGitDeps();
    const deps = { ...verifyDeps(scenario, fs), git: recorder.git };
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const finished = await verifyFinishCommand(
      { ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }), verificationType: unsupportedType },
      deps,
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    expect(recorder.calls()).toBe(0);
  });
});
