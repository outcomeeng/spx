/**
 * Guarded run scenarios over an in-memory host: the happy path, a slot held by another run, a child
 * that exits 3, and collaborators that fail before the command runs.
 */

import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createHostCommandLock,
  LOCK_ENV,
  NOT_READY_EXIT_CODE,
  RESULT_SCHEMA,
  RESULT_STATUS,
} from "@/lib/host-command-lock";
import { GUARDED_DESCRIPTOR_NUMBER, INHERITED_STDIO } from "@/lib/process-lifecycle";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  arbitraryDistinctLabels,
  arbitraryRetryJitters,
  quietSample,
} from "@testing/generators/host-command-lock/host-command-lock";
import { arbitrarySpawnFailureMessage } from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { EVENT_KIND, MemoryHost } from "@testing/harnesses/host-command-lock/host-command-lock";

const CLEAN_EXIT = 0;
const BUSY_RETRIES = 3;
const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const [firstRunId, secondRunId] = sampleGeneratedValue(arbitraryDistinctLabels(2));
const command = sampleGeneratedValue(arbitraryCommand());
const otherCommand = sampleGeneratedValue(arbitraryCommand());
const failureMessage = sampleGeneratedValue(arbitrarySpawnFailureMessage());

describe("a guarded command on a free slot and a quiet host", () => {
  it("takes the slot first, records the holder around the spawn, hands the child its descriptor, never unlocks, and reports completion", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const running = createHostCommandLock(host.deps()).run({ command, runId: firstRunId });
    await host.untilSpawned(1);
    const [lockDescriptor] = host.lockDescriptors();
    host.exitChild(0, CLEAN_EXIT);
    const { exitCode, result } = await running;

    expect(host.kinds()).toEqual([
      EVENT_KIND.ENSURE_DIRECTORY,
      EVENT_KIND.OPEN_LOCK_FILE,
      EVENT_KIND.LOCK_TAKEN,
      EVENT_KIND.SAMPLE,
      EVENT_KIND.RECORD_WRITE,
      EVENT_KIND.SPAWN,
      EVENT_KIND.RECORD_WRITE,
      EVENT_KIND.CHILD_EXIT,
    ]);
    expect(host.directoriesEnsured).toEqual([dirname(host.identity.lockPath)]);
    expect(host.recordWrites).toHaveLength(2);
    expect(host.recordWrites[0]).toMatchObject({
      runId: firstRunId,
      supervisorPid: host.identity.supervisorPid,
      workingDirectory: host.identity.workingDirectory,
      childProcessGroup: null,
    });
    expect(Date.parse(host.recordWrites[0].startedAt)).toBe(host.identity.startedAtMs);
    expect(host.recordWrites[1]).toEqual({ ...host.recordWrites[0], childProcessGroup: host.identity.childPids[0] });
    const [spawned] = host.spawns;
    expect(spawned.command).toBe(command[0]);
    expect(spawned.args).toEqual(command.slice(1));
    expect(spawned.options.stdio).toEqual([
      INHERITED_STDIO,
      INHERITED_STDIO,
      INHERITED_STDIO,
      lockDescriptor,
    ]);
    expect(spawned.options.detached).toBe(true);
    expect(spawned.options.env).toMatchObject({
      [LOCK_ENV.FD]: String(GUARDED_DESCRIPTOR_NUMBER),
      [LOCK_ENV.FILE_ID]: host.identity.fileId,
    });
    expect(host.unlocks).toEqual([]);
    expect(host.slotHeld()).toBe(false);
    expect(exitCode).toBe(CLEAN_EXIT);
    expect(result).toEqual({
      schema: RESULT_SCHEMA,
      runId: firstRunId,
      started: true,
      status: RESULT_STATUS.COMPLETED,
      childExitCode: CLEAN_EXIT,
    });
  });
});

describe("a guarded command whose slot another run holds", () => {
  it("retries after a base delay plus a randomized one and starts only after the holder's child exits", async () => {
    const jitters = sampleGeneratedValue(arbitraryRetryJitters(BUSY_RETRIES));
    const host = new MemoryHost({ cpuCount, samples: [quietSample()], retryJitters: jitters });

    const first = createHostCommandLock(host.deps({ runId: firstRunId })).run({ command, runId: firstRunId });
    await host.untilSpawned(1);
    const sleepsBeforeSecond = host.sleeps.length;
    host.scheduleChildExit(0, CLEAN_EXIT, BUSY_RETRIES);
    const second = createHostCommandLock(host.deps({ runId: secondRunId, childExitCode: CLEAN_EXIT })).run({
      command: otherCommand,
      runId: secondRunId,
    });
    const reports = await Promise.all([first, second]);

    const busySleeps = host.sleeps.slice(sleepsBeforeSecond, sleepsBeforeSecond + BUSY_RETRIES);
    expect(busySleeps.map((ms) => ms - busySleeps[0])).toEqual(jitters.map((jitter) => jitter - jitters[0]));
    expect(host.spawnsAtScheduledExit).toBe(1);
    const firstExit = host.events.findIndex((event) =>
      event.kind === EVENT_KIND.CHILD_EXIT && event.pid === host.identity.childPids[0]
    );
    const secondSpawn = host.events.findIndex((event) =>
      event.kind === EVENT_KIND.SPAWN && event.pid === host.identity.childPids[1]
    );
    expect(firstExit).toBeGreaterThan(-1);
    expect(secondSpawn).toBeGreaterThan(firstExit);
    expect(reports.map((report) => report.result?.started)).toEqual([true, true]);
  });
});

describe("a guarded command whose child exits 3", () => {
  it("reports started true, status completed, childExitCode 3, and exits 3", async () => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { exitCode, result } = await createHostCommandLock(
      host.deps({ runId: firstRunId, childExitCode: NOT_READY_EXIT_CODE }),
    ).run({ command, runId: firstRunId });

    expect(exitCode).toBe(NOT_READY_EXIT_CODE);
    expect(result).toEqual({
      schema: RESULT_SCHEMA,
      runId: firstRunId,
      started: true,
      status: RESULT_STATUS.COMPLETED,
      childExitCode: NOT_READY_EXIT_CODE,
    });
  });
});

describe("a guarded command whose collaborator fails before the command runs", () => {
  it.each([
    ["load source", { loadFailure: new Error(failureMessage) }, {}, RESULT_STATUS.LOCK_FILE_ERROR],
    [
      "sleep",
      { sleepFailure: new Error(failureMessage) },
      { externalHolderUntilMs: Number.POSITIVE_INFINITY },
      RESULT_STATUS.LOCK_FILE_ERROR,
    ],
    ["spawn", { spawnFailure: new Error(failureMessage) }, {}, RESULT_STATUS.SPAWN_FAILED],
  ])("ends with its own status when the %s fails, and releases the descriptor", async (_name, script, hostOptions, status) => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()], ...hostOptions });

    const { exitCode, result } = await createHostCommandLock(host.deps({ ...script, runId: firstRunId })).run({
      command,
      runId: firstRunId,
    });

    expect(result).toMatchObject({ runId: firstRunId, started: false, status });
    expect(exitCode).not.toBe(CLEAN_EXIT);
    expect(host.spawns).toEqual([]);
    expect(host.openSupervisorDescriptors()).toBe(0);
    expect(host.slotHeld()).toBe(false);
  });
});
