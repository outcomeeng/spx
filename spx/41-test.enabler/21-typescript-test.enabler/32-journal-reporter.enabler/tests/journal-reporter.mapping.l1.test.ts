import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import {
  expectedFindingsForScenario,
  JOURNAL_REPORTER_TEST_GENERATOR,
} from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeJournalReporterMapping } from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter hook-to-evidence mapping", () => {
  // Every member of the source-owned terminal-status domain is enumerated, and every driven scenario
  // holds both a passing and a failing case, so each mapping row participates structurally rather
  // than by the luck of a draw.
  it.each(Object.values(JOURNAL_RUN_TERMINAL_STATUS))(
    "maps a module to a scope, failing cases to findings, passing cases to none, and run end to %s",
    async (reason) => {
      await assertProperty(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
        async (scenario) => {
          const observation = await observeJournalReporterMapping(scenario, reason);
          expect(observation.scopes).toEqual([{ moduleId: scenario.moduleId }]);
          expect(observation.findings).toEqual(expectedFindingsForScenario(scenario));
          expect(observation.terminalStatus).toBe(reason);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    },
  );
});
