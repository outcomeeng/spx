import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_COMPARISON_STATUS } from "@/domains/verify/change-runs";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { parseRunComparisonReport, withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";

// A first commit adds every file the two runs judge; a second commit rewrites exactly one file both
// runs judge. The first run judges the first commit, the second run judges the second, each through a
// changeset scope ending at its commit, and each records one path the other run never judged.
describe("Change run comparison mapping", () => {
  it.each(Object.values(VERIFY_VERIFICATION_TYPE))(
    "maps the path both %s runs judged whose blob differs between their head commits to changed, every other path both judged to unchanged, and lists no path only one run judged",
    async (verificationType) => {
      const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
      const comparison = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison());
      await withChangeRunsRepository(scenario, async (repository) => {
        const firstHead = await repository.commitFiles(comparison.files);
        const secondHead = await repository.commitFiles([comparison.revision]);
        const firstRun = await repository.startRun({
          verificationType,
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          change: scenario.change,
          changesetHead: firstHead,
        });
        await repository.appendScope(
          firstRun,
          sampleGeneratedValue(
            VERIFY_TEST_GENERATOR.judgedScopeUnit(verificationType, firstRun.scope, comparison.firstJudgedPaths),
          ),
        );
        const secondRun = await repository.startRun({
          verificationType,
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          change: scenario.change,
          changesetHead: secondHead,
        });
        await repository.appendScope(
          secondRun,
          sampleGeneratedValue(
            VERIFY_TEST_GENERATOR.judgedScopeUnit(verificationType, secondRun.scope, comparison.secondJudgedPaths),
          ),
        );

        const compared = await repository.compareRuns(scenario.change, firstRun, secondRun);

        expect(compared.exitCode, compared.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = parseRunComparisonReport(compared.output);
        expect(report.first).toEqual(expect.objectContaining({ runToken: firstRun.runToken, headCommit: firstHead }));
        expect(report.second).toEqual(
          expect.objectContaining({ runToken: secondRun.runToken, headCommit: secondHead }),
        );
        expect(report.paths).toHaveLength(comparison.commonPaths.length);
        expect(new Map(report.paths.map(({ path, status }) => [path, status]))).toEqual(
          new Map(
            comparison.commonPaths.map((path) => [
              path,
              path === comparison.changedPath
                ? VERIFY_RUN_COMPARISON_STATUS.CHANGED
                : VERIFY_RUN_COMPARISON_STATUS.UNCHANGED,
            ]),
          ),
        );
        expect(report.paths.map(({ path }) => path)).not.toContain(comparison.firstOnlyPath);
        expect(report.paths.map(({ path }) => path)).not.toContain(comparison.secondOnlyPath);
      });
    },
  );
});
