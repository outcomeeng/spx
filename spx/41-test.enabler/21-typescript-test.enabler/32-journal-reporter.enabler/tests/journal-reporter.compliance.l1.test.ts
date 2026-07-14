import { describe, it } from "vitest";

import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  assertReporterAwaitsAsyncAppends,
  assertReporterStreamsPerHook,
  assertRunRegistersReporterProgrammatically,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter streaming", () => {
  it("appends each scope and finding as its hook fires, before run end rather than batched at the terminal event", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      async (scenario) => assertReporterStreamsPerHook(scenario),
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("awaits each sink append, so an asynchronous sink's write completes before the run advances", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      async (scenario) => assertReporterAwaitsAsyncAppends(scenario),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});

describe("journal reporter programmatic registration", () => {
  it("registers the reporter on a programmatically started run, not via a command-line reporter flag", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.runRequest(),
      async (request) => assertRunRegistersReporterProgrammatically(request),
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
