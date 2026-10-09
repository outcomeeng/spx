import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { VERIFY_RUN_COMPARISON_STATUS } from "@/domains/verify/change-runs";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { observeBuiltRunComparisonOfChange } from "@testing/harnesses/verify/built-cli";
import { parseRunComparisonReport } from "@testing/harnesses/verify/change-runs";

// A first commit adds every file the two runs judge; a second commit rewrites exactly one file both
// runs judge. Each run of the Change judges its own commit through a changeset scope ending there.
describe("verification run compare through the built executable", () => {
  it(
    "reports as JSON the one file both runs judged whose content differs between their head commits as changed, and every other file both judged as unchanged",
    async () => {
      const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
      const comparison = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison());
      await observeBuiltRunComparisonOfChange(scenario, comparison).then((observation) => {
        expect(observation.compare.exitCode, observation.compare.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = parseRunComparisonReport(observation.compare.stdout);
        expect(report.change).toBe(scenario.change);
        expect(report.first).toEqual(
          expect.objectContaining({ runToken: observation.firstRun.runToken, headCommit: observation.firstHead }),
        );
        expect(report.second).toEqual(
          expect.objectContaining({ runToken: observation.secondRun.runToken, headCommit: observation.secondHead }),
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
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
