import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  expectedFindingsForScenario,
  observeJournalReporterMapping,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter hook-to-evidence mapping", () => {
  it("maps a module to a scope, failing cases to findings, passing cases to none, and run end to a terminal status", async () => {
    await assertProperty(
      fc.tuple(
        JOURNAL_REPORTER_TEST_GENERATOR.runScenario(),
        JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus(),
      ),
      async ([scenario, reason]) => {
        const observation = await observeJournalReporterMapping(scenario, reason);
        expect(observation.scopes).toEqual([{ moduleId: scenario.moduleId }]);
        expect(observation.findings).toEqual(expectedFindingsForScenario(scenario));
        expect(observation.terminalStatus).toBe(reason);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
