import { describe, expect, it } from "vitest";

import { reconcileScope } from "@/domains/verify/reconciliation";
import { RECONCILIATION_TEST_GENERATOR } from "@testing/generators/verify/reconciliation";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verify scope reconciliation result", () => {
  it("reports the unaccounted, unexpected, and drifted sets its inputs fix, each in ordinal path order", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.scenario(),
      (scenario) => {
        expect(reconcileScope(scenario.input)).toEqual(scenario.expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reconciles exactly when the unaccounted, unexpected, and drifted sets are all empty", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.scenario(),
      (scenario) => {
        const result = reconcileScope(scenario.input);

        expect(result.reconciled).toBe(
          result.unaccounted.length === 0 && result.unexpected.length === 0 && result.drifted.length === 0,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
