import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RECONCILIATION_RESULT_FIELD } from "@/domains/verify/reconciliation";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { withVerifyFinishRepository } from "@testing/harnesses/verify/repository";

describe("verify repeated finish of a bound run", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "returns the recorded terminal projection of a bound %s run without reconciling again, though its inventory drifted since the first finish",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const run = await repository.startEmptyChangesetRun(verificationType, true);
        expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const first = await repository.finish(run, terminalStatus);
        expect(first.exitCode, first.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const eventsAfterFirst = await repository.readEvents(run);
        await repository.advanceHead();
        const drifted = await repository.reconcile(run);
        expect(JSON.parse(drifted.output)[VERIFY_RECONCILIATION_RESULT_FIELD.RECONCILED]).toBe(false);

        const repeated = await repository.finish(run, terminalStatus);

        expect(repeated.exitCode, repeated.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(repeated.output).toBe(first.output);
        expect(await repository.readEvents(run)).toEqual(eventsAfterFirst);
      });
    },
  );
});
