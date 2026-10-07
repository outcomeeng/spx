import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { parseChangeRunsReport, withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";

describe("Change runs listing scenario", () => {
  it("returns exactly one Change's runs from two branches and a detached head, grouped by verification type", async () => {
    const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
    await withChangeRunsRepository(scenario, async (repository) => {
      await repository.checkoutNewBranch(scenario.firstBranch);
      const review = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.change,
      });
      await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        change: scenario.otherChange,
      });
      await repository.checkoutNewBranch(scenario.secondBranch);
      const audit = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
      });
      await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
      });
      await repository.detachHead();
      const test = await repository.startRun({
        verificationType: VERIFY_VERIFICATION_TYPE.TEST,
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        change: scenario.change,
      });

      const listed = await repository.listChangeRuns(scenario.change);

      expect(listed.exitCode, listed.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseChangeRunsReport(listed.output);
      expect(report.change).toBe(scenario.change);
      expect(report.runs[VERIFY_VERIFICATION_TYPE.REVIEW].map((run) => run.runToken)).toEqual([review.runToken]);
      expect(report.runs[VERIFY_VERIFICATION_TYPE.AUDIT].map((run) => run.runToken)).toEqual([audit.runToken]);
      expect(report.runs[VERIFY_VERIFICATION_TYPE.TEST].map((run) => run.runToken)).toEqual([test.runToken]);
      expect(new Set(Object.keys(report.runs))).toEqual(new Set(Object.values(VERIFY_VERIFICATION_TYPE)));
    });
  });
});
