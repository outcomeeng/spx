import { describe, expect, it } from "vitest";

import { findSatisfyingRecordedRun, RECORDED_RUN_UNSATISFIED_REASON } from "@/commands/test";
import { judgeRecordedRun } from "@/commands/test/recorded-run";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { JUDGED_UNSATISFIED_REASONS, RECORDED_RUN_TEST_GENERATOR } from "@testing/generators/testing/recorded-run";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";
import { recordPassedRun, withRecordedRunRepository } from "@testing/harnesses/testing/recorded-run";

describe("recorded run satisfaction", () => {
  it("is satisfied when every condition holds", async () => {
    await assertProperty(
      RECORDED_RUN_TEST_GENERATOR.satisfyingScenario(),
      ({ run, selectedPaths, current }) => {
        expect(judgeRecordedRun(run, selectedPaths, current)).toEqual({ satisfied: true });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it.each(JUDGED_UNSATISFIED_REASONS)(
    "is unsatisfied with reason %s when only that condition is violated",
    async (reason) => {
      await assertProperty(
        RECORDED_RUN_TEST_GENERATOR.violatedScenario(reason),
        ({ run, selectedPaths, current }) => {
          expect(judgeRecordedRun(run, selectedPaths, current)).toEqual({ satisfied: false, reason });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
  );

  it("is unsatisfied with reason no-covering-run when the request selects a file the recorded run does not cover", async () => {
    const { file } = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithOwnFile(typescriptTestingLanguage));
    const [coveredPaths, uncoveredPaths] = sampleTestRunStateValue(
      TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
    );
    const uncoveredFile = [coveredPaths[0], uncoveredPaths[0]].find((path) => path !== file) ?? uncoveredPaths[0];

    await withRecordedRunRepository(file, async (repository) => {
      await recordPassedRun(repository);

      const covered = await findSatisfyingRecordedRun(
        { productDir: repository.productDir, selectedPaths: [file] },
        repository.deps,
      );
      expect(covered.satisfied).toBe(true);

      const uncovered = await findSatisfyingRecordedRun(
        { productDir: repository.productDir, selectedPaths: [file, uncoveredFile] },
        repository.deps,
      );
      expect(uncovered).toEqual({ satisfied: false, reason: RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN });
    });
  });
});
