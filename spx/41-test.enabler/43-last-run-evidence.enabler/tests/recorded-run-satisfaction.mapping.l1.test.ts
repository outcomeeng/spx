import { describe, expect, it } from "vitest";

import { findSatisfyingRecordedRun, RECORDED_RUN_UNSATISFIED_REASON } from "@/commands/test";
import { judgeRecordedRun } from "@/commands/test/recorded-run";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import {
  RECORDED_RUN_TEST_GENERATOR,
  RECORDED_RUN_VIOLATION_CASES,
  sampleRecordedRunValue,
} from "@testing/generators/testing/recorded-run";
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

  it.each(RECORDED_RUN_VIOLATION_CASES)(
    "is unsatisfied with reason $label when only that condition is violated",
    async (violationCase) => {
      await assertProperty(
        RECORDED_RUN_TEST_GENERATOR.violatedScenario(violationCase),
        ({ run, selectedPaths, current }) => {
          expect(judgeRecordedRun(run, selectedPaths, current)).toEqual({ satisfied: false, reason: violationCase.reason });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
  );

  it("is unsatisfied with reason no-covering-run when the request selects a file the recorded run does not cover", async () => {
    const { file, uncoveredFile } = sampleRecordedRunValue(
      RECORDED_RUN_TEST_GENERATOR.uncoveredRequestFiles(typescriptTestingLanguage),
    );

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
