import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { GENERATED_CASE_STATE, JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  assertAsyncSinkRecordsAfterMacrotask,
  assertRecordingSinkRecordsInOrder,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter recording evidence sink", () => {
  it("records every scope and finding append in invocation order", () => {
    assertProperty(
      fc.tuple(
        JOURNAL_REPORTER_TEST_GENERATOR.scopeUnits(),
        JOURNAL_REPORTER_TEST_GENERATOR.findings(),
      ),
      ([scopes, findings]) => assertRecordingSinkRecordsInOrder(scopes, findings),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("journal reporter async recording evidence sink", () => {
  it("records each append only after a macrotask boundary, not on a microtask tick", async () => {
    await assertProperty(
      fc.tuple(
        JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit(),
        JOURNAL_REPORTER_TEST_GENERATOR.finding(),
      ),
      async ([unit, finding]) => assertAsyncSinkRecordsAfterMacrotask(unit, finding),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("journal reporter run-scenario generator", () => {
  it("yields a module id with varied case states, failing cases carrying error text and passing cases none", () => {
    assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.runScenario(),
      (scenario) => {
        expect(scenario.moduleId.length).toBeGreaterThan(0);
        expect(scenario.cases.length).toBeGreaterThan(0);
        expect(
          scenario.cases.every((runCase) =>
            runCase.state === GENERATED_CASE_STATE.FAILED
              ? runCase.errors.length > 0
              : runCase.errors.length === 0
          ),
        ).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
