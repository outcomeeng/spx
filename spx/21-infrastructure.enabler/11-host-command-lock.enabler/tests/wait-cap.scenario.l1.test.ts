/**
 * Wait cap scenarios: the cap bounds slot contention and the load window together, and an expired
 * cap never starts the command, driven over a fake monotonic clock and a scripted load source.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, NOT_READY_EXIT_CODE, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCpuCount,
  capAtWindowEndSeconds,
  capInsideWindowSeconds,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  exitingWorkload,
  scriptedAdmission,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

describe("wait cap", () => {
  it("never starts the command when the lock stays busy until the wait cap, and re-queues nothing", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({
        samples: [quietSample()],
        cpuCount,
        slotFreeAtMs: Number.POSITIVE_INFINITY,
      }, lock);

      const { exitCode, result } = await createHostCommandLock(run.deps).run({
        command: exitingWorkload(0),
        waitSeconds: capInsideWindowSeconds(),
      });
      const attemptsAtEnd = run.busyAttemptsAtMs.length;
      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
      expect(exitCode).toBe(NOT_READY_EXIT_CODE);
      expect(run.lockTakenAtMs).toEqual([]);
      expect(run.busyAttemptsAtMs).toHaveLength(attemptsAtEnd);
    });
  });

  it("never starts the command when the cap expires between a passing window and the spawn", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({ samples: [quietSample()], cpuCount, slotFreeAtMs: 0 }, lock);

      const { result } = await createHostCommandLock(run.deps).run({
        command: exitingWorkload(0),
        waitSeconds: capAtWindowEndSeconds(),
      });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    });
  });

  it("never starts the command when the cap expires during the load window", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({ samples: [quietSample()], cpuCount, slotFreeAtMs: 0 }, lock);

      const { exitCode, result } = await createHostCommandLock(run.deps).run({
        command: exitingWorkload(0),
        waitSeconds: capInsideWindowSeconds(),
      });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
      expect(exitCode).toBe(NOT_READY_EXIT_CODE);
    });
  });
});
