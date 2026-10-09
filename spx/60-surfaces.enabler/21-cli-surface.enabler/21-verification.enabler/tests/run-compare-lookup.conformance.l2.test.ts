import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_RUN_COMPARISON_ERROR } from "@/commands/verify/change-runs";
import { VERIFY_CLI_EXIT_CODE, VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD } from "@/commands/verify/cli";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import {
  observeBuiltRunComparisonAcrossChanges,
  observeBuiltRunComparisonFirstAcrossChanges,
} from "@testing/harnesses/verify/built-cli";

// Both runs are started on the repository's one checked-out branch, so the store holds a single
// branch scope and the searched target the diagnostic names is exactly that scope's directory.
describe("verification run compare lookup diagnostic through the built executable", () => {
  it(
    "names the requested --run token, the --change value, and the store's branch-scope directory it searched when the second run is not a run of the Change",
    async () => {
      const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
      await observeBuiltRunComparisonAcrossChanges(
        scenario,
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.compare.stderr).toContain(VERIFY_RUN_COMPARISON_ERROR.RUN_NOT_IN_CHANGE);
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${observation.secondRun.runToken}`,
        );
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.CHANGE}${scenario.change}`,
        );
        expect(Object.keys(observation.storeBeforeCompare).map((path) => path.split(sep)[0])).toContain(
          observation.secondRun.branchSlug,
        );
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET}${
            join(observation.storeRoot, observation.secondRun.branchSlug)
          }`,
        );
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "names the requested --run token, the --change value, and the store's branch-scope directory it searched when the first run is not a run of the Change",
    async () => {
      const scenario = sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
      await observeBuiltRunComparisonFirstAcrossChanges(
        scenario,
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.compare.stderr).toContain(VERIFY_RUN_COMPARISON_ERROR.RUN_NOT_IN_CHANGE);
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${observation.firstRun.runToken}`,
        );
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.CHANGE}${scenario.change}`,
        );
        expect(Object.keys(observation.storeBeforeCompare).map((path) => path.split(sep)[0])).toContain(
          observation.firstRun.branchSlug,
        );
        expect(observation.compare.stderr).toContain(
          `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET}${
            join(observation.storeRoot, observation.firstRun.branchSlug)
          }`,
        );
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
