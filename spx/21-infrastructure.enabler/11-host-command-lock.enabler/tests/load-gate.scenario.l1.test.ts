/**
 * Load gate scenarios: the load window and the order of slot and samples, driven over a fake
 * monotonic clock, a scripted load source, and a recording lock binding.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, LOAD_WINDOW, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCpuCount,
  capInsideWindowSeconds,
  invalidSample,
  loudSample,
  overGapStallMs,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  exitingWorkload,
  scriptedAdmission,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const BAD_SAMPLE_INDEX = 3;

describe("load gate", () => {
  it("starts the command when the window passes on its seventh sample after 30 seconds", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({ samples: [quietSample()], cpuCount, slotFreeAtMs: 0 }, lock);

      const { result } = await createHostCommandLock(run.deps).run({ command: exitingWorkload(0) });

      expect(result?.started).toBe(true);
      expect(run.sampleTimesMs).toHaveLength(LOAD_WINDOW.MIN_SAMPLES);
      expect(run.sampleTimesMs[run.sampleTimesMs.length - 1] - run.sampleTimesMs[0]).toBeGreaterThanOrEqual(
        LOAD_WINDOW.MIN_SPAN_MS,
      );
    });
  });

  it("never starts the command on a window shorter than 30 seconds", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({ samples: [quietSample()], cpuCount, slotFreeAtMs: 0 }, lock);

      const { result } = await createHostCommandLock(run.deps).run({
        command: exitingWorkload(0),
        waitSeconds: capInsideWindowSeconds(),
      });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    });
  });

  it.each([
    ["exceeds a limit", (cpuCount: number) => loudSample(cpuCount), {}],
    ["is invalid", () => invalidSample(), {}],
  ])("discards a window in which a sample %s and starts only after a fresh full window", async (_name, bad, stall) => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const samples = [
        ...Array.from({ length: BAD_SAMPLE_INDEX }, () => quietSample()),
        bad(cpuCount),
        quietSample(),
      ];
      const run = scriptedAdmission({ samples, cpuCount, slotFreeAtMs: 0, stallBeforeSampleMs: stall }, lock);

      const { result } = await createHostCommandLock(run.deps).run({ command: exitingWorkload(0) });

      expect(result?.started).toBe(true);
      expect(
        run.sampleTimesMs[run.sampleTimesMs.length - 1] - run.sampleTimesMs[BAD_SAMPLE_INDEX + 1],
      ).toBeGreaterThanOrEqual(LOAD_WINDOW.MIN_SPAN_MS);
    });
  });

  it("discards a window in which two samples lie more than ten seconds apart and starts only after a fresh full window", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const run = scriptedAdmission({
        samples: [quietSample()],
        cpuCount,
        slotFreeAtMs: 0,
        stallBeforeSampleMs: { [BAD_SAMPLE_INDEX]: overGapStallMs() },
      }, lock);

      const { result } = await createHostCommandLock(run.deps).run({ command: exitingWorkload(0) });

      expect(result?.started).toBe(true);
      expect(
        run.sampleTimesMs[run.sampleTimesMs.length - 1] - run.sampleTimesMs[BAD_SAMPLE_INDEX],
      ).toBeGreaterThanOrEqual(LOAD_WINDOW.MIN_SPAN_MS);
    });
  });

  it("decides on a window sampled after the slot was taken", async () => {
    await withLockEnv(async (lock) => {
      const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
      const slotFreeAtMs = LOAD_WINDOW.MIN_SPAN_MS * 2;
      const run = scriptedAdmission({ samples: [quietSample()], cpuCount, slotFreeAtMs }, lock);

      await createHostCommandLock(run.deps).run({ command: exitingWorkload(0) });

      expect(run.lockTakenAtMs).toHaveLength(1);
      expect(run.sampleTimesMs.every((at) => at >= run.lockTakenAtMs[0])).toBe(true);
    });
  });
});
