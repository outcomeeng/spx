import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyFinishCommand,
  type VerifyFinishReport,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  findTerminalEvent,
  REVIEW_SCOPE_COVERAGE_STATE,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { JournalEvent } from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
} from "@/lib/appendable-journal-store";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import {
  appendFindingBatch,
  createRecordingGitDeps,
  createSealRetryFileSystem,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  openRawJournalRun,
  parseFinishReport,
  parseStartReport,
  readVerifyRunEvents,
  verifyAppendOptions,
  verifyDeps,
  verifyFinishOptions,
  verifyInputRecordFilePath,
  type VerifyRunContextScenario,
  verifyStartOptions,
  type VerifyStateStoreFileSystem,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

function reviewScenario(): VerifyRunContextScenario {
  return withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW);
}

/** Start a review run over a fresh in-memory store, asserting the start succeeds. */
async function startReviewRun() {
  const { scenario, fs, deps } = createVerifyAppendScenario(reviewScenario());
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  return {
    scenario,
    fs,
    deps,
    startReport,
    runToken: startReport.runToken,
    sealMarkerPath: appendableJournalSealMarkerPath(startReport.locator.runTarget),
  };
}

type StartedReviewRun = Awaited<ReturnType<typeof startReviewRun>>;

/**
 * Assert the run recorded no terminal completion and holds no seal marker, then finish it with a
 * freshly sampled terminal status: only an unsealed run records that status, since a finished run
 * returns its first terminal status, so the reported status proves the run stayed finishable.
 */
async function expectRunUnsealedAndFinishable(run: StartedReviewRun): Promise<void> {
  expect(findTerminalEvent(await readVerifyRunEvents(run.scenario, run.runToken, run.fs))).toBeUndefined();
  await expect(run.fs.readFile(run.sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
  const recovered = await verifyFinishCommand(
    verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus }),
    run.deps,
  );
  expect(recovered.exitCode, recovered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseFinishReport(recovered.output).terminalStatus).toBe(terminalStatus);
}

/** Assert a finish report matches the sealed terminal projection the journal events independently imply. */
function expectFinishReportMatchesJournal(
  report: VerifyFinishReport,
  events: readonly JournalEvent[],
  runToken: string,
  terminalStatus: string,
): void {
  expect(report.runToken).toBe(runToken);
  expect(report.terminalStatus).toBe(terminalStatus);
  expect(report.sealed).toBe(true);
  expect(report.findingCount).toBe(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING).length);
  expect(report.lastSequence).toBe(Math.max(...events.map((event) => event.seq)));
}

/** Assert the history carries exactly one terminal completion event and return it. */
function expectSingleTerminalEvent(events: readonly JournalEvent[]): JournalEvent {
  const terminalEvents = events.filter((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE);
  expect(terminalEvents).toHaveLength(1);
  return terminalEvents[0];
}

async function finishWithMetadata(
  run: StartedReviewRun,
  terminalStatus: string,
  terminalMetadata: unknown,
  deps: VerifyCliDeps = run.deps,
) {
  return verifyFinishCommand(
    {
      ...verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus }),
      terminalMetadata: JSON.stringify(terminalMetadata),
    },
    deps,
  );
}

describe("verify finish compliance", () => {
  it("rejects a blank terminal status without recording completion or sealing", async () => {
    const run = await startReviewRun();
    await assertProperty(
      VERIFY_TEST_GENERATOR.blankTerminalStatus(),
      async (blankStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus: blankStatus }),
          run.deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_REQUIRED);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    await expectRunUnsealedAndFinishable(run);
  });

  it("rejects a terminal status outside the journal terminal-status vocabulary", async () => {
    const run = await startReviewRun();
    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidTerminalStatus(),
      async (invalidStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus: invalidStatus }),
          run.deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    await expectRunUnsealedAndFinishable(run);
  });

  it("rejects a review run sealing with a terminal status foreign to the review vocabulary", async () => {
    const run = await startReviewRun();
    const eventsBeforeFinish = await readVerifyRunEvents(run.scenario, run.runToken, run.fs);

    const rejected = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.FAILED }),
      run.deps,
    );

    expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(rejected.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT), rejected.output).toBe(true);
    expect(await readVerifyRunEvents(run.scenario, run.runToken, run.fs)).toEqual(eventsBeforeFinish);

    const accepted = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
      run.deps,
    );
    expect(accepted.exitCode, accepted.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(accepted.output).terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.APPROVED);
  });

  it("rejects invalid verification-type terminal metadata without recording completion or sealing", async () => {
    const run = await startReviewRun();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewTerminalMetadata(),
      async (terminalMetadata) => {
        const finished = await finishWithMetadata(run, terminalStatus, terminalMetadata);
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID), finished.output).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
    await expectRunUnsealedAndFinishable(run);
  });

  it("rejects terminal metadata whose review state conflicts with the supplied terminal status", async () => {
    const run = await startReviewRun();

    const finished = await finishWithMetadata(
      run,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata()),
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT), finished.output).toBe(true);
    await expectRunUnsealedAndFinishable(run);
  });

  it("rejects approved review terminal status and metadata when finding evidence exists", async () => {
    const run = await startReviewRun();
    await appendFindingBatch(run.scenario, run.deps, run.runToken);

    const finished = await finishWithMetadata(
      run,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata()),
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT), finished.output).toBe(true);
    expect(findTerminalEvent(await readVerifyRunEvents(run.scenario, run.runToken, run.fs))).toBeUndefined();
    await expect(run.fs.readFile(run.sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    const sealed = await finishRun(run.scenario, run.deps, run.runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    expect(sealed.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.REJECTED);
  });

  it("rejects approved review terminal status and metadata when scope coverage reports a finding", async () => {
    const run = await startReviewRun();
    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, {
        run: run.runToken,
        payload: JSON.stringify({
          ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
          coverageState: REVIEW_SCOPE_COVERAGE_STATE.FINDING,
        }),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      run.deps,
    );
    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    // The run records the finding only through its scope coverage, never as a finding event.
    const eventsAfterScope = await readVerifyRunEvents(run.scenario, run.runToken, run.fs);
    expect(eventsAfterScope.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);

    const finished = await finishWithMetadata(
      run,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata()),
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT), finished.output).toBe(true);
    expect(findTerminalEvent(await readVerifyRunEvents(run.scenario, run.runToken, run.fs))).toBeUndefined();
    await expect(run.fs.readFile(run.sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    const sealed = await finishRun(run.scenario, run.deps, run.runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    expect(sealed.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.REJECTED);
  });

  it("accepts commented review terminal metadata with the caller-supplied terminal status", async () => {
    for (const terminalStatus of [JOURNAL_RUN_STATE_STATUS.APPROVED, JOURNAL_RUN_STATE_STATUS.REJECTED]) {
      const run = await startReviewRun();
      const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewCommentedTerminalMetadata());

      const finished = await finishWithMetadata(run, terminalStatus, terminalMetadata);

      expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseFinishReport(finished.output);
      expect(report.terminalStatus).toBe(terminalStatus);
      expect(report.terminalMetadata).toEqual(terminalMetadata);
    }
  });

  it("returns the existing terminal projection for a repeated finish without appending a second terminal event", async () => {
    const run = await startReviewRun();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    const options = verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus });
    const first = await verifyFinishCommand(options, run.deps);
    expect(first.exitCode, first.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const repeat = await verifyFinishCommand(options, run.deps);

    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const events = await readVerifyRunEvents(run.scenario, run.runToken, run.fs);
    expectFinishReportMatchesJournal(parseFinishReport(repeat.output), events, run.runToken, terminalStatus);
    expectSingleTerminalEvent(events);
  });

  it("retries the physical journal seal without listing sibling runs when repeated finish finds terminal completion unsealed", async () => {
    const scenario = reviewScenario();
    const fs = createSealRetryFileSystem();
    const deps = { ...createVerifyAppendScenario(scenario).deps, fs };
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
    const options = verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus });
    fs.failFirstSealWriteAt(sealMarkerPath);

    const first = await verifyFinishCommand(options, deps);

    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(first.output).toContain(VERIFY_CLI_ERROR.SEAL_FAILED);
    expect(findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs))).toBeDefined();
    await fs.rm(verifyInputRecordFilePath(scenario, startReport.runToken), { force: true });

    const repeat = await verifyFinishCommand(options, deps);

    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(repeat.output).terminalStatus).toBe(terminalStatus);
    await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(
      APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
    );
  });

  it("returns the existing terminal projection when a repeated finish cannot read the seal marker", async () => {
    const scenario = reviewScenario();
    const fs = createSealRetryFileSystem();
    const deps = { ...createVerifyAppendScenario(scenario).deps, fs };
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    await finishRun(scenario, deps, startReport.runToken, terminalStatus);
    fs.failSealMarkerReadsAt(appendableJournalSealMarkerPath(startReport.locator.runTarget));

    const repeat = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
      deps,
    );

    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const events = await readVerifyRunEvents(scenario, startReport.runToken, fs);
    expectFinishReportMatchesJournal(parseFinishReport(repeat.output), events, startReport.runToken, terminalStatus);
    expectSingleTerminalEvent(events);
  });

  it("rejects an unterminal raw journal run without a recorded verification input", async () => {
    const scenario = createVerifyRunContextScenario();
    const { fs, deps } = createVerifyAppendScenario(scenario);
    const rawRun = await openRawJournalRun(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());

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
    const run = await startReviewRun();
    const statuses = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.distinctReviewTerminalStatuses());
    await finishRun(run.scenario, run.deps, run.runToken, statuses.first);

    const second = await finishRun(run.scenario, run.deps, run.runToken, statuses.second);

    expect(second.terminalStatus).toBe(statuses.first);
    const events = await readVerifyRunEvents(run.scenario, run.runToken, run.fs);
    expectFinishReportMatchesJournal(second, events, run.runToken, statuses.first);
    expect(JSON.stringify(expectSingleTerminalEvent(events).data)).not.toContain(statuses.second);
  });

  it("returns the idempotent terminal projection without a journal binding", async () => {
    const run = await startReviewRun();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    await finishRun(run.scenario, run.deps, run.runToken, terminalStatus);
    await run.fs.writeFile(
      verifyInputRecordFilePath(run.scenario, run.runToken),
      JSON.stringify({ source: terminalStatus, digest: run.runToken, content: run.scenario.inputContent }),
    );

    const repeat = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus }),
      verifyDeps(run.scenario, run.fs),
    );

    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expectFinishReportMatchesJournal(
      parseFinishReport(repeat.output),
      await readVerifyRunEvents(run.scenario, run.runToken, run.fs),
      run.runToken,
      terminalStatus,
    );
  });

  it("rejects repeated finish when the recorded input selector differs from the requested scope", async () => {
    const run = await startReviewRun();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    await finishRun(run.scenario, run.deps, run.runToken, terminalStatus);
    // The recorded input names the reversed range, so its selector conflicts with the requested one.
    await run.fs.writeFile(
      verifyInputRecordFilePath(run.scenario, run.runToken),
      JSON.stringify({
        scopeIdentity: `${run.scenario.head}${VERIFY_SCOPE_SEPARATOR}${run.scenario.base}`,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        source: VERIFY_INPUT_SOURCE.STDIN,
        digest: run.startReport.input.digest,
        content: run.scenario.inputContent,
      }),
    );

    const repeat = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus }),
      run.deps,
    );

    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(repeat.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    expectSingleTerminalEvent(await readVerifyRunEvents(run.scenario, run.runToken, run.fs));
  });

  it("rejects an unsupported scope type or a malformed changeset scope before mutating the run", async () => {
    const run = await startReviewRun();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    const options = verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus });

    const unsupportedType = await verifyFinishCommand(
      { ...options, scopeType: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedScopeType()) },
      run.deps,
    );
    const malformedScope = await verifyFinishCommand(
      { ...options, scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()) },
      run.deps,
    );

    expect(unsupportedType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(unsupportedType.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
    expect(malformedScope.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(malformedScope.output).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);
    await expectRunUnsealedAndFinishable(run);
  });

  it("rejects an unsupported verification type before resolving an existing run to finish", async () => {
    const scenario = createVerifyRunContextScenario();
    const fs: VerifyStateStoreFileSystem = createInMemoryStateStoreFileSystem();
    const recorder = createRecordingGitDeps();
    const deps = { ...verifyDeps(scenario, fs), git: recorder.git };
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());

    const finished = await verifyFinishCommand(
      { ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }), verificationType: unsupportedType },
      deps,
    );

    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    // Finish resolved no run: the recording Git double saw no call.
    expect(recorder.calls()).toBe(0);
  });
});
