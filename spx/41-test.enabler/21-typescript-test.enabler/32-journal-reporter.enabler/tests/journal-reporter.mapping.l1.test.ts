import * as fc from "fast-check";
import { describe, it } from "vitest";

import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertJournalReporterMapping } from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter hook-to-evidence mapping", () => {
  it("maps a module to a scope, failing cases to findings, passing cases to none, and run end to a terminal status", () => {
    fc.assert(
      fc.property(
        JOURNAL_REPORTER_TEST_GENERATOR.runScenario(),
        JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus(),
        (scenario, reason) => assertJournalReporterMapping(scenario, reason),
      ),
    );
  });
});
