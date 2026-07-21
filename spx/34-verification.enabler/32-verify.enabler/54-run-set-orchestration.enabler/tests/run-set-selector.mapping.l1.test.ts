import { describe, expect, it } from "vitest";

import { selectRunSet } from "@/domains/verify/run-set";
import { runSetSelectorMappingCases } from "@testing/generators/verify/run-set";

describe("run-set selector mapping", () => {
  it.each(runSetSelectorMappingCases())(
    "maps the $backend merge period, verification type, scope type, and run-set scope key to prior runs and current scope",
    (mapping) => {
      const selection = selectRunSet(mapping.runs, mapping.selector);
      expect(selection.priorRuns.map((run) => run.runToken)).toEqual(mapping.expectedPriorTokens);
      expect(selection.currentRun?.runToken).toBe(mapping.expectedCurrentToken);
      expect(selection.currentScope.map((unit) => unit.unitKey)).toEqual(mapping.expectedCurrentScopeKeys);
    },
  );

  it.each(runSetSelectorMappingCases())(
    "preserves each $backend member run's own scope identity as run evidence",
    (mapping) => {
      const selection = selectRunSet(mapping.runs, mapping.selector);
      const selected = [...selection.priorRuns, ...(selection.currentRun === undefined ? [] : [selection.currentRun])];
      expect(selected.length).toBeGreaterThan(1);
      for (const run of selected) {
        expect(run.scopeIdentity).toBe(mapping.expectedScopeIdentityByToken[run.runToken]);
      }
      expect(new Set(selected.map((run) => run.scopeIdentity)).size).toBe(selected.length);
    },
  );
});
