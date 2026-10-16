import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, type VerifyStatusReport } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { findTerminalEvent, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyFinishRepository } from "@testing/harnesses/verify/repository";

describe("verify finish reconciliation of a bound run", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "refuses to finish a bound %s run whose recorded evidence leaves an inventory entry unaccounted, recording nothing and reporting the reconciliation result",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startChangesetRun(verificationType, true);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const reconciled = await repository.reconcile(run);
        expect(JSON.parse(reconciled.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
        const eventsBefore = await repository.readEvents(run);

        const finished = await repository.finish(run, terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toContain(reconciled.output);
        const eventsAfter = await repository.readEvents(run);
        expect(eventsAfter).toEqual(eventsBefore);
        expect(findTerminalEvent(eventsAfter)).toBeUndefined();
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        expect(status.sealed).toBe(false);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "refuses to finish a bound %s run that judged a path its inventory and expectations do not name, recording nothing and reporting the reconciliation result",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
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
        const reconciled = await repository.reconcile(run);
        expect(JSON.parse(reconciled.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
        const eventsBefore = await repository.readEvents(run);

        const finished = await repository.finish(run, evidence.terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toContain(reconciled.output);
        const eventsAfter = await repository.readEvents(run);
        expect(eventsAfter).toEqual(eventsBefore);
        expect(findTerminalEvent(eventsAfter)).toBeUndefined();
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        expect(status.sealed).toBe(false);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "refuses to finish a bound %s run whose changeset inventory drifted since the run started, recording nothing and reporting the reconciliation result",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startEmptyChangesetRun(verificationType, true);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        await repository.advanceHead();
        const reconciled = await repository.reconcile(run);
        expect(JSON.parse(reconciled.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);
        const eventsBefore = await repository.readEvents(run);

        const finished = await repository.finish(run, terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toContain(reconciled.output);
        const eventsAfter = await repository.readEvents(run);
        expect(eventsAfter).toEqual(eventsBefore);
        expect(findTerminalEvent(eventsAfter)).toBeUndefined();
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        expect(status.sealed).toBe(false);
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
        const final = await repository.reconcile(run);
        expect(JSON.parse(final.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);

        const finished = await repository.finish(run, accounting.terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toContain(final.output);
        expect(findTerminalEvent(await repository.readEvents(run))).toBeUndefined();
      });
    },
  );
});
