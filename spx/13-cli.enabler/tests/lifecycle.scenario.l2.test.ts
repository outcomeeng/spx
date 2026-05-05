import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EPIPE_EXIT_CODE } from "@/lib/process-lifecycle";

const repoRoot = resolve(__dirname, "..", "..", "..");
const fixturePath = resolve(__dirname, "fixtures", "epipe-emitter.ts");
const epipeSmokeTimeoutMs = 30_000;
const stdoutBufferFillMs = 200;

const signalToCode: Record<string, number> = {
  SIGINT: 130,
  SIGTERM: 143,
  SIGPIPE: 141,
};

describe("Scenario L2: stdout closed mid-write under EPIPE", () => {
  it(
    "exits with EPIPE_EXIT_CODE and emits no uncaughtException on stderr when the consumer closes the pipe",
    async () => {
      const child = spawn("npx", ["tsx", fixturePath], { cwd: repoRoot });

      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      // Do not consume stdout. Let the OS pipe buffer fill so the fixture
      // blocks on its next write. Then destroy the parent's read end; the
      // fixture's next write produces an EPIPE error event.
      setTimeout(() => {
        child.stdout.destroy();
      }, stdoutBufferFillMs);

      const exitCode = await new Promise<number>((resolveExit) => {
        child.on("exit", (code, signal) => {
          if (signal !== null) {
            resolveExit(signalToCode[signal] ?? -1);
            return;
          }
          resolveExit(code ?? -1);
        });
      });

      expect(exitCode).toBe(EPIPE_EXIT_CODE);
      expect(stderr).not.toMatch(/uncaughtException/);
      expect(stderr).not.toMatch(/Error: EPIPE/);
    },
    epipeSmokeTimeoutMs,
  );
});
