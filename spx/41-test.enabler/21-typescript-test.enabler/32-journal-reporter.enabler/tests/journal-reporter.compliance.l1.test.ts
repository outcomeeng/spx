import * as fc from "fast-check";
import { describe, it } from "vitest";

import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import {
  assertReporterStreamsPerHook,
  assertRunRegistersReporterProgrammatically,
} from "@testing/harnesses/testing/journal-reporter";

describe("journal reporter streaming", () => {
  it("appends each scope and finding as its hook fires, before run end rather than batched at the terminal event", () => {
    fc.assert(
      fc.property(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
        (scenario) => assertReporterStreamsPerHook(scenario),
      ),
    );
  });
});

describe("journal reporter programmatic registration", () => {
  it("registers the reporter on a programmatically started run, not via a command-line reporter flag", async () => {
    await fc.assert(
      fc.asyncProperty(
        JOURNAL_REPORTER_TEST_GENERATOR.runRequest(),
        (request) => assertRunRegistersReporterProgrammatically(request),
      ),
    );
  });
});
