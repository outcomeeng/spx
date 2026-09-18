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
  observeStreamingRunWithRejectingSink,
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

describe("journal reporter lost-append surfacing", () => {
  it("rejects the streaming run with the first sink failure after the run returns, yielding no terminal status", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario().chain((scenario) =>
        JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus().map((reason) => ({ scenario, reason }))
      ),
      async ({ scenario, reason }) => {
        const observation = await observeStreamingRunWithRejectingSink(scenario, reason);
        expect(observation.hookRejectionsCaught).toBeGreaterThan(1);
        expect(observation.issuedFailures.length).toBe(observation.hookRejectionsCaught);
        expect(observation.rejection).toBe(observation.issuedFailures[0]);
        expect(observation.resolved).toBeUndefined();
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
