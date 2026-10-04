import { describe, expect, it } from "vitest";

import { LIFECYCLE_EXIT_ORACLE } from "@testing/generators/process-lifecycle/lifecycle";
import { runEpipeEmitterFixture } from "@testing/harnesses/process-lifecycle/spawn-fixture";

describe("Scenario L2: stdout closed mid-write under EPIPE", () => {
  it("exits successfully and emits no uncaughtException on stderr when the consumer closes the pipe", async () => {
    const result = await runEpipeEmitterFixture();

    expect(result.exitCode).toBe(LIFECYCLE_EXIT_ORACLE.EPIPE);
    expect(result.stderr).not.toMatch(/uncaughtException/);
    expect(result.stderr).not.toMatch(/Error: EPIPE/);
  });
});
