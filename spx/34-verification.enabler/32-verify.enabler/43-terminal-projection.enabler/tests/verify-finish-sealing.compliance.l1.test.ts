import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, type VerifyFinishReport } from "@/commands/verify/cli";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { withVerifyFinishRepository } from "@testing/harnesses/verify/repository";

describe("verify finish sealing of a bound run that reconciles", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "seals a bound %s run whose changeset inventory is empty exactly as an unbound run with the same evidence",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const terminalStatus = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses())[
          verificationType
        ];
        const unbound = await repository.startEmptyChangesetRun(verificationType, false);
        const bound = await repository.startEmptyChangesetRun(verificationType, true);
        expect(unbound.started.exitCode, unbound.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(bound.started.exitCode, bound.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const unboundFinish = await repository.finish(unbound, terminalStatus);
        const boundFinish = await repository.finish(bound, terminalStatus);

        expect(unboundFinish.exitCode, unboundFinish.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(boundFinish.exitCode, boundFinish.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const unboundReport = JSON.parse(unboundFinish.output) as VerifyFinishReport;
        const boundReport = JSON.parse(boundFinish.output) as VerifyFinishReport;
        expect({ ...boundReport, runToken: unboundReport.runToken }).toEqual(unboundReport);
        expect(boundReport.sealed).toBe(true);
      });
    },
  );

  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "seals a bound %s run whose accounted evidence its verification type rejects as rejected rather than refusing it",
    async (verificationType) => {
      await withVerifyFinishRepository(async (repository) => {
        const unbound = await repository.startChangesetRun(verificationType, false);
        const bound = await repository.startChangesetRun(verificationType, true);
        const evidence = sampleVerifyTestValue(
          VERIFY_TEST_GENERATOR.judgedEvidenceTerminalCase(verificationType, bound.scope, [repository.sourcePath]),
        );
        const unboundAppend = await repository.appendScope(unbound, evidence.payload);
        const boundAppend = await repository.appendScope(bound, evidence.payload);
        expect(unboundAppend.appended.exitCode, unboundAppend.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(boundAppend.appended.exitCode, boundAppend.appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

        const unboundFinish = await repository.finish(unbound, evidence.terminalStatus);
        const boundFinish = await repository.finish(bound, evidence.terminalStatus);

        expect(unboundFinish.exitCode, unboundFinish.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(boundFinish.exitCode, boundFinish.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const unboundReport = JSON.parse(unboundFinish.output) as VerifyFinishReport;
        const boundReport = JSON.parse(boundFinish.output) as VerifyFinishReport;
        expect(boundReport.terminalStatus).toBe(evidence.terminalStatus);
        expect({ ...boundReport, runToken: unboundReport.runToken }).toEqual(unboundReport);
        expect(boundReport.sealed).toBe(true);
      });
    },
  );
});
