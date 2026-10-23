/**
 * Nested pass-through scenario over an in-memory host: a guarded call inside a running guarded
 * command runs under the outer slot.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock } from "@/lib/host-command-lock";
import { INHERITED_STDIO } from "@/lib/process-lifecycle";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { arbitraryExitCode } from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const command = sampleGeneratedValue(arbitraryCommand());
const innerExitCode = sampleGeneratedValue(arbitraryExitCode());

describe("a nested guarded call that carries the outer descriptor", () => {
  it("starts its command at once in the inherited process group, with no window and no result line, keeping the command's exit code", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    const outer = host.holdOuterSlot();

    const running = createHostCommandLock(host.deps({ environment: outer.environment })).run({ command });
    await host.untilSpawned(1);
    host.exitChild(0, innerExitCode);
    const report = await running;

    const [spawned] = host.spawns;
    expect(report).toEqual({ exitCode: innerExitCode });
    expect(spawned.options.detached).not.toBe(true);
    expect(spawned.options.stdio).toEqual([INHERITED_STDIO, INHERITED_STDIO, INHERITED_STDIO, outer.descriptor]);
    expect(host.sampleTimesMs).toEqual([]);
    expect(host.sleeps).toEqual([]);
    expect(host.recordWrites).toEqual([]);
    expect(host.unlocks).toEqual([]);
  });
});
