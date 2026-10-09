import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFY_RUN_COMPARISON_ERROR } from "@/commands/verify/change-runs";
import { VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import { runFileName } from "@/lib/state-store";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CHANGE_RUNS_TEST_GENERATOR } from "@testing/generators/verify/change-runs";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import {
  observeBuiltRunComparisonAcrossChanges,
  observeBuiltRunComparisonOfChange,
  observeBuiltRunComparisonWithChangelessRun,
  observeBuiltRunComparisonWithHeadlessRun,
} from "@testing/harnesses/verify/built-cli";

describe("verification run compare compliance through the built executable", () => {
  it(
    "rejects a comparison whose second --run names a run of another Change, naming that run token and reporting nothing",
    async () => {
      await observeBuiltRunComparisonAcrossChanges(
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario()),
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.compare.stdout).toHaveLength(0);
        expect(observation.compare.stderr).toContain(VERIFY_RUN_COMPARISON_ERROR.RUN_NOT_IN_CHANGE);
        expect(observation.compare.stderr).toContain(observation.secondRun.runToken);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "rejects a comparison whose second --run names a run serving no Change, naming that run token and reporting nothing",
    async () => {
      await observeBuiltRunComparisonWithChangelessRun(
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario()),
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.compare.stdout).toHaveLength(0);
        expect(observation.compare.stderr).toContain(VERIFY_RUN_COMPARISON_ERROR.RUN_NOT_IN_CHANGE);
        expect(observation.compare.stderr).toContain(observation.secondRun.runToken);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "rejects a comparison whose second --run names a run of the Change that recorded no head commit, naming that run token, reporting nothing, and leaving the store unchanged",
    async () => {
      await observeBuiltRunComparisonWithHeadlessRun(
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario()),
      ).then((observation) => {
        expect(observation.compare.exitCode).not.toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(observation.compare.stdout).toHaveLength(0);
        expect(observation.compare.stderr).toContain(VERIFY_RUN_COMPARISON_ERROR.HEAD_COMMIT_ABSENT);
        expect(observation.compare.stderr).toContain(observation.secondRun.runToken);
        expect(Object.keys(observation.storeBeforeCompare).map((path) => basename(path))).toEqual(
          expect.arrayContaining([
            runFileName(observation.firstRun.runToken),
            runFileName(observation.secondRun.runToken),
          ]),
        );
        expect(observation.storeAfterCompare).toEqual(observation.storeBeforeCompare);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "accepts a comparison whose two --run values both name runs of the Change --change names",
    async () => {
      await observeBuiltRunComparisonOfChange(
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario()),
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode, observation.compare.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it(
    "appends no journal event and seals no run: the store's branch scopes are unchanged by a comparison",
    async () => {
      await observeBuiltRunComparisonOfChange(
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.scenario()),
        sampleGeneratedValue(CHANGE_RUNS_TEST_GENERATOR.runComparison()),
      ).then((observation) => {
        expect(observation.compare.exitCode, observation.compare.stderr).toBe(VERIFY_CLI_EXIT_CODE.OK);
        expect(Object.keys(observation.storeBeforeCompare).map((path) => basename(path))).toEqual(
          expect.arrayContaining([
            runFileName(observation.firstRun.runToken),
            runFileName(observation.secondRun.runToken),
          ]),
        );
        expect(observation.storeAfterCompare).toEqual(observation.storeBeforeCompare);
      });
    },
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );
});
