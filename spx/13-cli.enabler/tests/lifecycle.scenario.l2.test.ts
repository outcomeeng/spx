import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EPIPE_EXIT_CODE } from "@/lib/process-lifecycle";
import { runSpawnFixture } from "@testing/harnesses/process-lifecycle/spawn-fixture";

const repoRoot = resolve(__dirname, "..", "..", "..");
const fixturePath = resolve(__dirname, "fixtures", "epipe-emitter.ts");
const stdoutBufferFillMs = 200;

describe("Scenario L2: stdout closed mid-write under EPIPE", () => {
  it("exits with EPIPE_EXIT_CODE and emits no uncaughtException on stderr when the consumer closes the pipe", async () => {
    const result = await runSpawnFixture({
      command: "npx",
      args: ["tsx", fixturePath],
      cwd: repoRoot,
      destroyStdoutAfterMs: stdoutBufferFillMs,
    });

    expect(result.exitCode).toBe(EPIPE_EXIT_CODE);
    expect(result.stderr).not.toMatch(/uncaughtException/);
    expect(result.stderr).not.toMatch(/Error: EPIPE/);
  });
});
