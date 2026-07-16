import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD } from "@/commands/verify/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  assertInputRejectsRecordedScopeMismatch,
  assertInputRejectsUnsupportedVerificationTypeBeforeExistingRunLookup,
  assertInputReportsReadFailureForInvalidRecordJson,
  assertInputReportsReadFailureForRecordMissingSelectorFields,
  observeInputReplayReaderCalls,
  observeMissingRunLookup,
  replayStartedRunWithToken,
  replayWithRunToken,
} from "@testing/harnesses/verify/harness";

describe("verify input compliance", () => {
  it("requires a non-blank --run token", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.blankRunToken(),
      async (runToken) => {
        const replayed = await replayWithRunToken(runToken);
        expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(replayed.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a type/scope-only selection without a run token even when a run exists in the namespace", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.blankRunToken(),
      async (runToken) => {
        const observed = await replayStartedRunWithToken(runToken);
        expect(observed.start.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observed.replay.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(observed.replay.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects an unsupported verification type before resolving an existing run", async () => {
    await assertInputRejectsUnsupportedVerificationTypeBeforeExistingRunLookup();
  });

  it("names every run selector and searched target when the run cannot be located", async () => {
    await observeMissingRunLookup().then(({ scenario, runToken, command, inputRecordPath }) => {
      expect(command.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(command.output).toContain(runToken);
      expect(command.output).toContain(scenario.verificationType);
      expect(command.output).toContain(VERIFY_SCOPE_TYPE.CHANGESET);
      expect(command.output).toContain(scenario.scope);
      expect(command.output).toContain(
        `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.BACKEND}${JOURNAL_BACKEND.LOCAL}`,
      );
      expect(command.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.NAMESPACE);
      expect(command.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET);
      expect(command.output).toContain(inputRecordPath);
      expect(command.output).toContain(
        `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE_TYPE}${VERIFY_SCOPE_TYPE.CHANGESET}`,
      );
      expect(command.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE}${scenario.scope}`);
    });
  });

  it("rejects an existing run token when the requested scope differs from the recorded run scope", async () => {
    await assertInputRejectsRecordedScopeMismatch();
  });

  it("replays the recorded input rather than reading a fresh input source", async () => {
    await observeInputReplayReaderCalls().then(({ scenario, start, replay, inputReport, readerCalls }) => {
      expect(start.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(replay.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      expect(inputReport.content).toBe(scenario.inputContent);
      expect(readerCalls).toBe(0);
    });
  });

  it("reports input-read failure when the recorded input file is missing selector fields", async () => {
    await assertInputReportsReadFailureForRecordMissingSelectorFields();
  });

  it("reports input-read failure when the recorded input file is invalid JSON", async () => {
    await assertInputReportsReadFailureForInvalidRecordJson();
  });
});
