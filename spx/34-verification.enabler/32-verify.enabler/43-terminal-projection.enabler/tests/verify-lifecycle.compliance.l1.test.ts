import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { journalOpenCommand } from "@/commands/journal/cli";
import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyFinishCommand, verifyStartCommand } from "@/commands/verify/cli";
import {
  findTerminalEvent,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
} from "@/domains/verify/verify";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
} from "@/lib/appendable-journal-store";
import { STATE_STORE_TEXT_ENCODING, type StateStoreFileSystem } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
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
} from "@testing/harnesses/verify/harness";

interface SealRetryFileSystem extends StateStoreFileSystem {
  failDirectoryListings(): void;
  failFirstSealWriteAt(path: string): void;
}

interface RawJournalOpenReport {
  readonly runToken: string;
}

function parseRawJournalOpenReport(output: string): RawJournalOpenReport {
  return JSON.parse(output) as RawJournalOpenReport;
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

    expect(parseFinishReport(repeat.output)).toEqual(parseFinishReport(first.output));
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

    const first = await finishRun(scenario, deps, runToken, statuses.first);
    const second = await finishRun(scenario, deps, runToken, statuses.second);

    // First status wins: the second finish returns the recorded projection, not the new status.
    expect(second.terminalStatus).toBe(statuses.first);
    expect(second).toEqual(first);
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
    const first = await finishRun(scenario, deps, runToken, terminalStatus);
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
    expect(parseFinishReport(repeat.output)).toEqual(first);
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
});
