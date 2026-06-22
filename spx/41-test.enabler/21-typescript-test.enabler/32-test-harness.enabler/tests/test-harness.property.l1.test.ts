import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";
import { assertRecordingCommandRunnerContract } from "@testing/harnesses/testing/recording-command-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("typescript recording command runner", () => {
  it("reports configured presence, records each Vitest invocation in order, and returns the configured exit code", async () => {
    await assertRecordingCommandRunnerContract(
      createRecordingCommandRunner,
      { present: TYPESCRIPT_RUNNER_TEST_GENERATOR.present(), exitCode: TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode() },
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
    );
  });
});

describe("typescript runner node-path generator", () => {
  it("yields a non-empty list of distinct node paths", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePaths(), (nodePaths) => {
        expect(nodePaths.length).toBeGreaterThan(0);
        expect(new Set(nodePaths).size).toBe(nodePaths.length);
      }),
    );
  });
});
