import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { findTerminalEvent, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { type VerifyFinishRepository, withVerifyFinishRepository } from "@testing/harnesses/verify/repository";
import { observeFinishAttempt } from "@testing/harnesses/verify/terminal-projection";

describe("verify finish reconciliation of a bound run", () => {
  it.each(
    Object.values(VERIFY_VERIFICATION_TYPE).flatMap((verificationType) => [
      {
        verificationType,
        condition: "whose recorded evidence leaves an inventory entry unaccounted",
        arrange: async (repository: VerifyFinishRepository) => {
          const run = await repository.startChangesetRun(verificationType, true);
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          return {
            run,
            terminalStatus: sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
              verificationType
            ],
          };
        },
      },
      {
        verificationType,
        condition: "that judged a path its inventory and expectations do not name",
        arrange: async (repository: VerifyFinishRepository) => {
          const run = await repository.startChangesetRun(verificationType, true);
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const evidence = sampleVerifyTestValue(
            VERIFY_TEST_GENERATOR.judgedEvidenceTerminalCase(verificationType, run.scope, [
              repository.sourcePath,
              repository.unchangedPath,
            ]),
          );
          const appended = await repository.appendScope(run, evidence.payload);
          expect(appended.appended.exitCode, appended.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          return { run, terminalStatus: evidence.terminalStatus };
        },
      },
      {
        verificationType,
        condition: "whose changeset inventory drifted since the run started",
        arrange: async (repository: VerifyFinishRepository) => {
          const run = await repository.startEmptyChangesetRun(verificationType, true);
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          await repository.advanceHead();
          return {
            run,
            terminalStatus: sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
              verificationType
            ],
          };
        },
      },
    ]),
  )(
    "refuses to finish a bound $verificationType run $condition, recording nothing and reporting the reconciliation result",
    async ({ arrange }) => {
      await withVerifyFinishRepository(async (repository) => {
        const { run, terminalStatus } = await arrange(repository);

        const attempt = await observeFinishAttempt(repository, run, terminalStatus);

        expect(JSON.parse(attempt.reconciliation.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
        expect(attempt.finished.exitCode, attempt.finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(attempt.finished.output).toContain(attempt.reconciliation.output);
        expect(attempt.eventsAfter).toEqual(attempt.eventsBefore);
        expect(findTerminalEvent(attempt.eventsAfter)).toBeUndefined();
        expect(attempt.status.sealed).toBe(false);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "reconciles the final recorded evidence of a bound %s run at finish, so an earlier passing prefix authorizes no sealing",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const run = await repository.startChangesetRun(verificationType, true);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const accounting = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedEvidenceTerminalCase(verificationType, run.scope, [repository.sourcePath]),
        );
        const accounted = await repository.appendScope(run, accounting.payload);
        expect(accounted.appended.exitCode, accounted.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const prefix = await repository.reconcile(run);
        expect(JSON.parse(prefix.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(true);
        await repository.advanceHead();

        const attempt = await observeFinishAttempt(repository, run, accounting.terminalStatus);

        expect(JSON.parse(attempt.reconciliation.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
        expect(attempt.finished.exitCode, attempt.finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(attempt.finished.output).toContain(attempt.reconciliation.output);
        expect(findTerminalEvent(attempt.eventsAfter)).toBeUndefined();
      });
    },
  );
});
