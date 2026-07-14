import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { GENERATED_CASE_STATE, JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertRecordingSinkRecordsInOrder } from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter recording evidence sink", () => {
  it("records every scope and finding append in invocation order", () => {
    fc.assert(
      fc.property(
        JOURNAL_REPORTER_TEST_GENERATOR.scopeUnits(),
        JOURNAL_REPORTER_TEST_GENERATOR.findings(),
        (scopes, findings) => assertRecordingSinkRecordsInOrder(scopes, findings),
      ),
    );
  });
});

describe("journal reporter run-scenario generator", () => {
  it("yields a module id with varied case states, failing cases carrying error text and passing cases none", () => {
    fc.assert(
      fc.property(JOURNAL_REPORTER_TEST_GENERATOR.runScenario(), (scenario) => {
        expect(scenario.moduleId.length).toBeGreaterThan(0);
        expect(scenario.cases.length).toBeGreaterThan(0);
        expect(
          scenario.cases.every((runCase) =>
            runCase.state === GENERATED_CASE_STATE.FAILED
              ? runCase.errors.length > 0
              : runCase.errors.length === 0
          ),
        ).toBe(true);
      }),
    );
  });
});
