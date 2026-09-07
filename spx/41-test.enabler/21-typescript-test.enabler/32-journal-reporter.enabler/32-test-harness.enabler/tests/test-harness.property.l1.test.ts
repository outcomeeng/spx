import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { GENERATED_CASE_STATE, JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  observeAsyncSinkAppendTiming,
  observeInterleavedSinkAppends,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter recording evidence sink", () => {
  it("records every scope and finding append in invocation order", () => {
    assertProperty(
      fc.tuple(
        JOURNAL_REPORTER_TEST_GENERATOR.scopeUnits(),
        JOURNAL_REPORTER_TEST_GENERATOR.findings(),
      ),
      ([scopes, findings]) => {
        const observation = observeInterleavedSinkAppends(scopes, findings);
        expect(observation.sink.scopes).toEqual(scopes);
        expect(observation.sink.findings).toEqual(findings);
        expect(observation.sink.calls).toEqual(observation.appended);
      },
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
      async ([unit, finding]) => {
        const observation = await observeAsyncSinkAppendTiming(unit, finding);
        expect(observation.scope.beforeAwait).toEqual([]);
        expect(observation.scope.afterMicrotask).toEqual([]);
        expect(observation.scope.afterAwait).toEqual([unit]);
        expect(observation.finding.beforeAwait).toEqual([]);
        expect(observation.finding.afterMicrotask).toEqual([]);
        expect(observation.finding.afterAwait).toEqual([finding]);
      },
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

  it("varies case states, failing-case error text, and module ids across every batch of draws", () => {
    assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.runScenarioBatch(),
      (batch) => {
        expect(new Set(batch.flatMap((scenario) => scenario.cases.map((runCase) => runCase.state)))).toEqual(
          new Set(Object.values(GENERATED_CASE_STATE)),
        );
        expect(
          new Set(
            batch.flatMap((scenario) =>
              scenario.cases
                .filter((runCase) => runCase.state === GENERATED_CASE_STATE.FAILED)
                .flatMap((runCase) => runCase.errors)
            ),
          ).size,
        ).toBeGreaterThan(1);
        expect(new Set(batch.map((scenario) => scenario.moduleId)).size).toBeGreaterThan(1);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
