/**
 * Wait cap scenarios: the cap bounds slot contention and the load window together, and an expired
 * cap never starts the command, driven over an in-memory host with a fake monotonic clock and a
 * scripted load source.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, NOT_READY_EXIT_CODE, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  capAtWindowEndSeconds,
  capInsideWindowSeconds,
  CLEAN_EXIT_CODE,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const command = sampleGeneratedValue(arbitraryCommand());

describe("wait cap", () => {
  it("never starts the command when the lock stays busy until the wait cap, and re-queues nothing", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({
      cpuCount,
      samples: [quietSample()],
      externalHolderUntilMs: Number.POSITIVE_INFINITY,
    });

    const { exitCode, result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT_CODE })).run({
      command,
      waitSeconds: capInsideWindowSeconds(),
    });
    const attemptsAtEnd = host.busyAttemptsAtMs.length;
    await host.settle(1);

    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    expect(exitCode).toBe(NOT_READY_EXIT_CODE);
    expect(host.lockTakenAtMs).toEqual([]);
    expect(host.spawns).toEqual([]);
    expect(host.busyAttemptsAtMs).toHaveLength(attemptsAtEnd);
    expect(host.openSupervisorDescriptors()).toBe(0);
  });

  it("never starts the command when the cap expires between a passing window and the spawn", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT_CODE })).run({
      command,
      waitSeconds: capAtWindowEndSeconds(),
    });

    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    expect(host.spawns).toEqual([]);
  });

  it("never starts the command when the cap expires during the load window", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { exitCode, result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT_CODE })).run({
      command,
      waitSeconds: capInsideWindowSeconds(),
    });

    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    expect(exitCode).toBe(NOT_READY_EXIT_CODE);
    expect(host.spawns).toEqual([]);
  });
});
