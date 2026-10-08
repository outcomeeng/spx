import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import {
  VERIFY_DRIVE_MODE,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import {
  parseChangeRunsReport,
  type StartedChangeRun,
  withChangeRunsRepository,
} from "@testing/harnesses/verify/change-runs";

describe("Change runs listing mapping", () => {
  it("maps every verification type, scope type, and drive mode a run starts with, open or finished, to a listed run carrying its selectors, drive mode, sealed state, terminal status, and per-disposition finding counts", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    const terminalStatuses = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.evidenceFreeTerminalStatuses());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const started: { readonly run: StartedChangeRun; readonly terminalStatus?: string }[] = [];
      for (const verificationType of Object.values(VERIFY_VERIFICATION_TYPE)) {
        for (const scopeType of Object.values(VERIFY_SCOPE_TYPE)) {
          for (const driveMode of Object.values(VERIFY_DRIVE_MODE)) {
            const request = { verificationType, scopeType, driveMode, change: scenario.change };
            started.push({ run: await repository.startRun(request) });
            const finished = await repository.startRun(request);
            await repository.finish(finished, terminalStatuses[verificationType]);
            started.push({ run: finished, terminalStatus: terminalStatuses[verificationType] });
          }
        }
      }

      const listed = await repository.listChangeRuns(scenario.change);

      expect(listed.exitCode, listed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseChangeRunsReport(listed.output);
      expect(Object.values(report.runs).flat()).toHaveLength(started.length);
      for (const { run, terminalStatus } of started) {
        const entry = report.runs[run.verificationType].find((listedRun) => listedRun.runToken === run.runToken);
        expect(entry).toEqual(expect.objectContaining({
          runToken: run.runToken,
          verificationType: run.verificationType,
          scopeType: run.scopeType,
          scope: run.scope,
          driveMode: run.driveMode,
          sealed: terminalStatus !== undefined,
        }));
        expect(entry?.terminalStatus).toBe(terminalStatus);
        expect(entry?.headCommit).toBe(
          run.scopeType === VERIFY_SCOPE_TYPE.CHANGESET ? repository.headCommit : undefined,
        );
        expect(Object.keys(entry?.findingCounts ?? {})).toEqual(
          expect.arrayContaining(Object.values(VERIFY_FINDING_DISPOSITION)),
        );
      }
    });
  });
});
