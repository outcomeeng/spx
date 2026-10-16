import { describe, expect, it } from "vitest";

import { reconcileScope } from "@/domains/verify/reconciliation";
import {
  changeInventoryOfRun,
  expectationsOfRun,
  runJudgedDeletionsOf,
  runJudgedPathsOf,
} from "@/domains/verify/verify";
import { RECONCILIATION_TEST_GENERATOR } from "@testing/generators/verify/reconciliation";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("verify scope reconciliation determinism", () => {
  it("derives the same result from the four inputs whatever their order and however often a path repeats", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.determinismScenario(),
      (scenario) => {
        expect(reconcileScope(scenario.variant)).toEqual(reconcileScope(scenario.input));
        expect(reconcileScope(scenario.variant)).toEqual(scenario.expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("derives the same result from a run history however its scope events, coverage states, and findings are arranged", () => {
    assertProperty(
      RECONCILIATION_TEST_GENERATOR.historiesScenario(),
      (scenario) => {
        const reconciled = (events: typeof scenario.single) =>
          reconcileScope({
            recordedInventory: changeInventoryOfRun(events) ?? [],
            expectations: expectationsOfRun(events),
            judgedPaths: runJudgedPathsOf(events),
            judgedDeletions: runJudgedDeletionsOf(events),
            resolvedInventory: scenario.input.resolvedInventory,
          });

        expect(reconciled(scenario.split)).toEqual(reconciled(scenario.single));
        expect(reconciled(scenario.split)).toEqual(scenario.expected);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
