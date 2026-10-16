import { describe, expect, it } from "vitest";

import { reconcileScope } from "@/domains/verify/reconciliation";
import { RECONCILIATION_TEST_GENERATOR } from "@testing/generators/verify/reconciliation";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verify scope reconciliation expectations", () => {
  it("expects every recorded inventory entry whatever the bound expectations declare", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.expectationsScenario(),
      (scenario) => {
        const result = reconcileScope({
          recordedInventory: scenario.recordedInventory,
          expectations: scenario.expectations,
          judgedPaths: [],
          judgedDeletions: [],
          resolvedInventory: scenario.recordedInventory,
        });

        expect(result.unaccounted).toEqual(
          expect.arrayContaining(scenario.recordedInventory.map((entry) => entry.path)),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("never lets expectations remove an unaccounted path the bare inventory leaves", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.expectationsScenario(),
      (scenario) => {
        const judged = { judgedPaths: scenario.judgedPaths, judgedDeletions: scenario.judgedDeletions };
        const bound = reconcileScope({
          recordedInventory: scenario.recordedInventory,
          expectations: scenario.expectations,
          ...judged,
          resolvedInventory: scenario.recordedInventory,
        });
        const bare = reconcileScope({
          recordedInventory: scenario.recordedInventory,
          expectations: undefined,
          ...judged,
          resolvedInventory: scenario.recordedInventory,
        });

        expect(bound.unaccounted).toEqual(expect.arrayContaining([...bare.unaccounted]));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
