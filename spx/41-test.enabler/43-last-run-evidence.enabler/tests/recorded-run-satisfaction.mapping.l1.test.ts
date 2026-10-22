import { describe, expect, it } from "vitest";

import { judgeRecordedRun } from "@/commands/test/recorded-run";
import { JUDGED_UNSATISFIED_REASONS, RECORDED_RUN_TEST_GENERATOR } from "@testing/generators/testing/recorded-run";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

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
});
