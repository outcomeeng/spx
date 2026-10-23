/**
 * Load gate scenarios: the load window and the order of slot and samples, driven over an in-memory
 * host with a fake monotonic clock and a scripted load source.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, LOAD_WINDOW, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryBadSampleIndex,
  arbitraryCommand,
  arbitraryCpuCount,
  capInsideWindowSeconds,
  invalidSample,
  loudFiveMinuteSample,
  loudSample,
  overGapStallMs,
  quietSample,
  risingThenFlatSamples,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const CLEAN_EXIT = 0;
const badSampleIndex = sampleGeneratedValue(arbitraryBadSampleIndex());
const command = sampleGeneratedValue(arbitraryCommand());

describe("load gate", () => {
  it("starts the command when the window passes on its seventh sample after 30 seconds", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({ command });

    expect(result?.started).toBe(true);
    expect(host.sampleTimesMs).toHaveLength(LOAD_WINDOW.MIN_SAMPLES);
    expect(host.sampleTimesMs[host.sampleTimesMs.length - 1] - host.sampleTimesMs[0]).toBeGreaterThanOrEqual(
      LOAD_WINDOW.MIN_SPAN_MS,
    );
  });

  it("never starts the command on a window shorter than 30 seconds", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({
      command,
      waitSeconds: capInsideWindowSeconds(),
    });

    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NOT_READY });
    expect(host.spawns).toEqual([]);
  });

  it.each([
    ["exceeds the one-minute limit", (cpuCount: number) => loudSample(cpuCount)],
    ["exceeds the five-minute limit", (cpuCount: number) => loudFiveMinuteSample(cpuCount)],
    ["is invalid", () => invalidSample()],
  ])("discards a window in which a sample %s and starts only after a fresh full window", async (_name, bad) => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const samples = [
      ...Array.from({ length: badSampleIndex }, () => quietSample()),
      bad(cpuCount),
      quietSample(),
    ];
    const host = new MemoryHost({ cpuCount, samples });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({ command });

    expect(result?.started).toBe(true);
    expect(
      host.sampleTimesMs[host.sampleTimesMs.length - 1] - host.sampleTimesMs[badSampleIndex + 1],
    ).toBeGreaterThanOrEqual(LOAD_WINDOW.MIN_SPAN_MS);
  });

  it("discards a window in which two samples lie more than ten seconds apart and starts only after a fresh full window", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({
      cpuCount,
      samples: [quietSample()],
      stallBeforeSampleMs: { [badSampleIndex]: overGapStallMs() },
    });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({ command });

    expect(result?.started).toBe(true);
    expect(
      host.sampleTimesMs[host.sampleTimesMs.length - 1] - host.sampleTimesMs[badSampleIndex],
    ).toBeGreaterThanOrEqual(LOAD_WINDOW.MIN_SPAN_MS);
  });

  it("discards a window whose one-minute load rises and starts only once the load stops rising", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const host = new MemoryHost({ cpuCount, samples: risingThenFlatSamples(cpuCount) });

    const { result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({ command });

    expect(result?.started).toBe(true);
    expect(host.sampleTimesMs.length).toBeGreaterThan(LOAD_WINDOW.MIN_SAMPLES);
  });

  it("decides on a window sampled after the slot was taken", async () => {
    const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
    const externalHolderUntilMs = LOAD_WINDOW.MIN_SPAN_MS * 2;
    const host = new MemoryHost({ cpuCount, samples: [quietSample()], externalHolderUntilMs });

    await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({ command });

    expect(host.lockTakenAtMs).toHaveLength(1);
    expect(host.lockTakenAtMs[0]).toBeGreaterThanOrEqual(externalHolderUntilMs);
    expect(host.sampleTimesMs.every((at) => at >= host.lockTakenAtMs[0])).toBe(true);
  });
});
