import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, type VerifyStatusReport } from "@/commands/verify/cli";
import {
  findTerminalEvent,
  VERIFY_EXPECTATIONS_ERROR,
  VERIFY_EXPECTATIONS_FIELD,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyFinishRepository } from "@testing/harnesses/verify/repository";

describe("verify finish of a run whose recorded run context carries expectations", () => {
  describe.each(Object.values(VERIFY_VERIFICATION_TYPE))("%s run", (verificationType) => {
    it.each(Object.values(VERIFY_EXPECTATIONS_FIELD))(
      "refuses the first finish when the recorded expectations are malformed on %s, naming the field and recording nothing",
      async (field) => {
        await withVerifyFinishRepository(async (repository) => {
          const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
            verificationType
          ];
          const run = await repository.startChangesetRunRecordingExpectations(
            verificationType,
            sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedExpectationsOn(field)),
          );
          expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
          const eventsBefore = await repository.readEvents(run);

          const finished = await repository.finish(run, terminalStatus);

          expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(finished.output).toContain(VERIFY_CLI_ERROR.FINISH_EXPECTATIONS_MALFORMED);
          expect(finished.output).toContain(field);
          const eventsAfter = await repository.readEvents(run);
          expect(eventsAfter).toEqual(eventsBefore);
          expect(findTerminalEvent(eventsAfter)).toBeUndefined();
          const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
          expect(status.sealed).toBe(false);
        });
      },
    );

    it("refuses the first finish when the recorded expectations are not an object, naming the malformed value and recording nothing", async () => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startChangesetRunRecordingExpectations(
          verificationType,
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.nonObjectExpectations()),
        );
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const eventsBefore = await repository.readEvents(run);

        const finished = await repository.finish(run, terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toContain(VERIFY_CLI_ERROR.FINISH_EXPECTATIONS_MALFORMED);
        expect(finished.output).toContain(VERIFY_EXPECTATIONS_ERROR.NOT_OBJECT);
        const eventsAfter = await repository.readEvents(run);
        expect(eventsAfter).toEqual(eventsBefore);
        expect(findTerminalEvent(eventsAfter)).toBeUndefined();
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        expect(status.sealed).toBe(false);
      });
    });

    it("treats a run-context event that carries no expectations value as unbound, so its first finish records terminal completion and seals", async () => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startEmptyChangesetRun(verificationType, false);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const [recordedContext] = run.runContextData;
        expect(recordedContext).toBeDefined();
        expect(VERIFY_RUN_CONTEXT_EVENT_FIELD.EXPECTATIONS in (recordedContext ?? {})).toBe(false);

        const finished = await repository.finish(run, terminalStatus);

        expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(findTerminalEvent(await repository.readEvents(run))).toBeDefined();
        const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
        expect(status.sealed).toBe(true);
      });
    });
  });
});
