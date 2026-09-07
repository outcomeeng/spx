import { describe, expect, it } from "vitest";

import {
  expectedFindingsForScenario,
  GENERATED_CASE_STATE,
  JOURNAL_REPORTER_TEST_GENERATOR,
} from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  observeReporterPerHook,
  observeReporterWithAsyncSink,
  observeStreamingRunStart,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter streaming", () => {
  it("appends each scope and finding as its hook fires, before run end rather than batched at the terminal event", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      async (scenario) => {
        const observation = await observeReporterPerHook(scenario);
        expect(observation.scopesAfterModuleStart).toEqual([{ moduleId: scenario.moduleId }]);
        for (const snapshot of observation.caseSnapshots) {
          if (snapshot.runCase.state === GENERATED_CASE_STATE.FAILED) {
            expect(snapshot.findings.at(-1)).toEqual({
              moduleId: scenario.moduleId,
              testName: snapshot.runCase.testName,
              errors: snapshot.runCase.errors,
            });
          }
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("awaits each sink append, so an asynchronous sink's write completes before the run advances", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      async (scenario) => {
        const observation = await observeReporterWithAsyncSink(scenario);
        expect(observation.scopesAfterModuleStart).toEqual([{ moduleId: scenario.moduleId }]);
        expect(observation.findingsAfterCases).toEqual(expectedFindingsForScenario(scenario));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("journal reporter programmatic registration", () => {
  it("registers the reporter on a programmatically started run, not via a command-line reporter flag", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.runRequest(),
      async (request) => {
        const startedRuns = await observeStreamingRunStart(request);
        expect(startedRuns).toHaveLength(1);
        expect(startedRuns[0]?.reporters).toHaveLength(1);
        expect(startedRuns[0]?.testPaths).toEqual(request.testPaths);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
