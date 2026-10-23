/**
 * Supervisor death scenarios over an in-memory host. A supervisor that stops forever at a scripted
 * point leaves the slot to the descriptor its child inherited; the host closes the supervisor's own
 * descriptors when it is killed, as the kernel does for a dead process.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  arbitraryDistinctLabels,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost, SUPERVISOR_DEATH, type SupervisorDeath } from "@testing/harnesses/host-command-lock/host-command-lock";

const CLEAN_EXIT = 0;
const WAITER_RETRIES = 3;
const SETTLE_TURNS = 50;
const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const [runId, waiterRunId] = sampleGeneratedValue(arbitraryDistinctLabels(2));
const command = sampleGeneratedValue(arbitraryCommand());
const waiterCommand = sampleGeneratedValue(arbitraryCommand());

/** Starts a run whose supervisor stops at `death`, then kills that supervisor. */
async function killedRun(death: SupervisorDeath, host: MemoryHost): Promise<void> {
  void createHostCommandLock(host.deps({ runId, supervisorDeath: death })).run({ command, runId });
  await host.settle(SETTLE_TURNS);
  host.killSupervisor();
}

describe("a supervisor killed while it holds the slot", () => {
  it("keeps the slot until the child exits and names the orphaned run in the holder record", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    await killedRun(SUPERVISOR_DEATH.AFTER_GROUP_RECORD, host);
    const record = host.holderRecord();
    const slotHeldAfterKill = host.slotHeld();

    host.scheduleChildExit(0, CLEAN_EXIT, WAITER_RETRIES);
    const waiter = await createHostCommandLock(host.deps({ runId: waiterRunId, childExitCode: CLEAN_EXIT })).run({
      command: waiterCommand,
      runId: waiterRunId,
    });

    expect(slotHeldAfterKill).toBe(true);
    expect(record).toMatchObject({
      runId,
      supervisorPid: host.identity.supervisorPid,
      workingDirectory: host.identity.workingDirectory,
      childProcessGroup: host.identity.childPids[0],
    });
    expect(Date.parse(record?.startedAt as string)).toBe(host.identity.startedAtMs);
    expect(host.spawnsAtScheduledExit).toBe(1);
    expect(waiter.result?.started).toBe(true);
    expect(host.spawns).toHaveLength(2);
  });

  it("names the run with its child process group unknown when the supervisor dies before recording it", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    await killedRun(SUPERVISOR_DEATH.BEFORE_GROUP_RECORD, host);
    const record = host.holderRecord();
    const slotHeldAfterKill = host.slotHeld();

    host.scheduleChildExit(0, CLEAN_EXIT, WAITER_RETRIES);
    const waiter = await createHostCommandLock(host.deps({ runId: waiterRunId, childExitCode: CLEAN_EXIT })).run({
      command: waiterCommand,
      runId: waiterRunId,
    });

    expect(slotHeldAfterKill).toBe(true);
    expect(record?.runId).toBe(runId);
    expect(record?.childProcessGroup).toBeNull();
    expect(host.spawnsAtScheduledExit).toBe(1);
    expect(waiter.result?.started).toBe(true);
  });

  it("admits a waiter at once when the supervisor dies after taking the lock and before spawning", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    await killedRun(SUPERVISOR_DEATH.BEFORE_SPAWN, host);
    const slotHeldAfterKill = host.slotHeld();

    const waiter = await createHostCommandLock(host.deps({ runId: waiterRunId, childExitCode: CLEAN_EXIT })).run({
      command: waiterCommand,
      runId: waiterRunId,
    });

    expect(slotHeldAfterKill).toBe(false);
    expect(host.busyAttemptsAtMs).toEqual([]);
    expect(waiter.result?.started).toBe(true);
  });
});

describe("a supervisor killed before it reports", () => {
  it("leaves no result line and no exit code, with the holder record the only evidence naming the run", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });
    let reported = false;

    void createHostCommandLock(host.deps({ runId, supervisorDeath: SUPERVISOR_DEATH.AFTER_GROUP_RECORD }))
      .run({ command, runId })
      .then(() => {
        reported = true;
      });
    await host.settle(SETTLE_TURNS);
    host.killSupervisor();
    await host.settle(SETTLE_TURNS);

    expect(reported).toBe(false);
    expect(host.holderRecord()?.runId).toBe(runId);
  });
});
