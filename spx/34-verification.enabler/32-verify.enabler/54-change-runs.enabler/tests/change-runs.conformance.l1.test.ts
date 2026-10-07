import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { parseChangeRunsReport, withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";

describe("Change runs listing conformance to status", () => {
  it("reports each listed run's sealed state, terminal status, drive mode, and finding counts exactly as status reports them", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const unsealedReview = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.appendFindings(unsealedReview, [...batches.defects, ...batches.filedOrStale]);
      const rejectedReview = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.appendFindings(rejectedReview, batches.defects);
      await repository.finish(rejectedReview, JOURNAL_RUN_STATE_STATUS.REJECTED);
      const passedTest = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.TEST,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
      });
      await repository.finish(passedTest, JOURNAL_RUN_STATE_STATUS.PASSED);

      const listed = await repository.listChangeRuns(scenario.change);

      expect(listed.exitCode, listed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseChangeRunsReport(listed.output);
      for (const run of [unsealedReview, rejectedReview, passedTest]) {
        const status = await repository.status(run);
        const entry = report.runs[run.verificationType].find((listedRun) => listedRun.runToken === run.runToken);
        expect(entry).toEqual(expect.objectContaining({
          sealed: status.sealed,
          driveMode: status.driveMode,
          findingCount: status.findingCount,
          findingCounts: status.findingCounts,
        }));
        expect(entry?.terminalStatus).toBe(status.terminalStatus);
      }
    });
  });
});
