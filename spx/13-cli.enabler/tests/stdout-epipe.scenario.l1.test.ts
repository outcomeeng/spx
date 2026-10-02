import { describe, expect, it } from "vitest";

import { LIFECYCLE_EXIT_ORACLE } from "@testing/generators/process-lifecycle/lifecycle";
import { runEpipeEmitter } from "@testing/harnesses/process-lifecycle/epipe-emitter";

describe("Scenario: stdout closed mid-write under EPIPE", () => {
  it("exits with the pipe-close exit code and emits no uncaughtException on stderr when the consumer closes the pipe", async () => {
    const result = await runEpipeEmitter();

    expect(result.exitCode).toBe(LIFECYCLE_EXIT_ORACLE.DOWNSTREAM_CLOSED_PIPE);
    expect(result.stderr).not.toMatch(/uncaughtException/);
    expect(result.stderr).not.toMatch(/Error: EPIPE/);
  });
});
