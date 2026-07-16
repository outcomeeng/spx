import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_SCOPE_ERROR } from "@/domains/verify/verify";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  observeStartPreservesReusedVerificationContextWhenInputPersistenceFails,
  observeStartPreservesReusedVerificationContextWhenJournalOpenFails,
  observeStartPreservesReusedVerificationContextWhenRunContextFails,
  observeStartRecordedInputReplay,
  observeStartRejectsChangedScopeFailureBeforeOpeningRun,
  observeStartRejectsUnsupportedVerificationTypeBeforeOpeningRun,
  observeStartRemovesOpenedRunArtifactsWhenInputPersistenceFails,
  observeStartRemovesOpenedRunArtifactsWhenRunContextFails,
  observeStartRemovesVerificationContextWhenJournalOpenFails,
  observeStartReportsInputReadFailuresBeforeOpeningRun,
  startWithInputSource,
  startWorkingTreeScope,
} from "@testing/harnesses/verify/harness";

describe("verify start compliance", () => {
  it("requires a non-blank --input source before starting a run", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.blankInputSource(),
      async (input) => {
        const started = await startWithInputSource(input);
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toBe(VERIFY_CLI_ERROR.INPUT_REQUIRED);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects an unsupported verification type before opening a run", async () => {
    await observeStartRejectsUnsupportedVerificationTypeBeforeOpeningRun().then(({ started, stateRootExists }) => {
      expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(started.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
      expect(stateRootExists).toBe(false);
    });
  });

  it("rejects a changed-scope failure before opening an addressable run", async () => {
    await observeStartRejectsChangedScopeFailureBeforeOpeningRun().then(
      ({ started, replayed, stateRootExists }) => {
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toContain(VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED);
        expect(stateRootExists).toBe(false);
        expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(replayed.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
      },
    );
  });

  it("reports input-read failures before opening an addressable run", async () => {
    await observeStartReportsInputReadFailuresBeforeOpeningRun().then(({ started, stateRootExists }) => {
      expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
      expect(stateRootExists).toBe(false);
    });
  });

  it("removes the verification context when journal opening fails", async () => {
    await observeStartRemovesVerificationContextWhenJournalOpenFails().then(({ started, contextExists }) => {
      expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(contextExists).toBe(false);
    });
  });

  it("preserves a reused verification context when journal opening fails", async () => {
    await observeStartPreservesReusedVerificationContextWhenJournalOpenFails().then(
      ({ created, started, contextExists }) => {
        expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(contextExists).toBe(true);
      },
    );
  });

  it("removes opened run artifacts when recorded-input persistence fails", async () => {
    await observeStartRemovesOpenedRunArtifactsWhenInputPersistenceFails().then(
      ({ started, runEntryCount, contextExists }) => {
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED);
        expect(runEntryCount).toBe(0);
        expect(contextExists).toBe(false);
      },
    );
  });

  it("preserves a reused verification context when recorded-input persistence fails", async () => {
    await observeStartPreservesReusedVerificationContextWhenInputPersistenceFails().then(
      ({ created, started, contextExists }) => {
        expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED);
        expect(contextExists).toBe(true);
      },
    );
  });

  it("removes opened run artifacts when recording the run drive mode fails", async () => {
    await observeStartRemovesOpenedRunArtifactsWhenRunContextFails().then(
      ({ started, runEntryCount, contextExists }) => {
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toContain(VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED);
        expect(runEntryCount).toBe(0);
        expect(contextExists).toBe(false);
      },
    );
  });

  it("preserves a reused verification context when recording the run drive mode fails", async () => {
    await observeStartPreservesReusedVerificationContextWhenRunContextFails().then(
      ({ created, started, contextExists }) => {
        expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(started.output).toContain(VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED);
        expect(contextExists).toBe(true);
      },
    );
  });

  it("records the verification input at start so the input verb replays it", async () => {
    await observeStartRecordedInputReplay().then(({ scenario, start, replay, inputReport }) => {
      expect(start.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(replay.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(inputReport.content).toBe(scenario.inputContent);
    });
  });

  it("rejects a working-tree scope type that the verification-context substrate cannot represent", async () => {
    await startWorkingTreeScope().then((started) => {
      expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(started.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
    });
  });
});
