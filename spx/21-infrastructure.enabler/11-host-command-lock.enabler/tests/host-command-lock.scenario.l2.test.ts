/**
 * Guarded run scenarios: commands sharing an orchestration lock file never overlap, the slot
 * belongs to the descriptor the child inherited so a killed supervisor leaves it held until the
 * last holder exits, and a child's exit 3 is a completed run.
 */

import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, readHolderRecord, RESULT_SCHEMA, RESULT_STATUS } from "@/lib/host-command-lock";
import { arbitraryDistinctLabels, arbitraryPathSegment } from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  dilatedDeps,
  exitingWorkload,
  intervalStarted,
  intervalWorkload,
  isAlive,
  leavingWorkload,
  OBSERVATION_MS,
  readInterval,
  RECORD_WRITE_AFTER_SPAWN,
  RECORD_WRITE_BEFORE_SPAWN,
  SIGNAL,
  startSupervisor,
  waitUntil,
  withLockEnv,
  withRepositoryDir,
  workerActive,
  workerPid,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const labels = sampleGeneratedValue(arbitraryDistinctLabels(3));
const label = { first: labels[0], second: labels[1], waiter: labels[2] };
const runId = sampleGeneratedValue(arbitraryPathSegment());

describe("guarded commands that share an orchestration lock file", () => {
  it("run in intervals that never overlap", async () => {
    await withLockEnv(async (lock) => {
      await withRepositoryDir(async (repositoryA) => {
        await withRepositoryDir(async (repositoryB) => {
          const guard = createHostCommandLock(dilatedDeps(lock.lockPath));

          const reports = await Promise.all([
            guard.run({ command: intervalWorkload(lock.dir, label.first, OBSERVATION_MS), cwd: repositoryA }),
            guard.run({ command: intervalWorkload(lock.dir, label.second, OBSERVATION_MS), cwd: repositoryB }),
          ]);
          const first = readInterval(lock.dir, label.first);
          const second = readInterval(lock.dir, label.second);

          expect(reports.map((report) => report.result?.started)).toEqual([true, true]);
          expect(first.endMs <= second.startMs || second.endMs <= first.startMs).toBe(true);
        });
      });
    });
  });
});

describe("a supervisor killed while it holds the slot", () => {
  it("keeps the slot until the child exits and names the orphaned run in the holder record", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir), runId });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      const worker = workerPid(lock.dir);
      process.kill(supervisor.pid, SIGNAL.KILL);
      await supervisor.exit;

      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, label.waiter, 1),
      });
      await delay(OBSERVATION_MS);
      const record = readHolderRecord(lock.lockPath);
      const admittedWhileChildAlive = intervalStarted(lock.dir, label.waiter);
      process.kill(worker, SIGNAL.KILL);
      await waiter;

      expect(admittedWhileChildAlive).toBe(false);
      expect(record).toMatchObject({
        runId,
        supervisorPid: supervisor.pid,
        workingDirectory: process.cwd(),
      });
      expect(record.childProcessGroup).toBe(worker);
      expect(Number.isNaN(Date.parse(record.startedAt))).toBe(false);
      expect(intervalStarted(lock.dir, label.waiter)).toBe(true);
    });
  });

  it("names the run with its child process group unknown when the supervisor dies before recording it", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir), runId }, {
        killOnRecordWrite: RECORD_WRITE_AFTER_SPAWN,
      });
      await supervisor.exit;
      await waitUntil(() => workerPidRecorded(lock.dir));
      const worker = workerPid(lock.dir);

      const record = readHolderRecord(lock.lockPath);
      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, label.waiter, 1),
      });
      await delay(OBSERVATION_MS);
      const admittedWhileChildAlive = intervalStarted(lock.dir, label.waiter);
      process.kill(worker, SIGNAL.KILL);
      await waiter;

      expect(record.runId).toBe(runId);
      expect(record.childProcessGroup).toBeNull();
      expect(admittedWhileChildAlive).toBe(false);
    });
  });

  it("admits a waiter at once when the supervisor dies after taking the lock and before spawning", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: exitingWorkload(0), runId }, {
        killOnRecordWrite: RECORD_WRITE_BEFORE_SPAWN,
      });
      await supervisor.exit;

      const { result } = await createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: exitingWorkload(0),
      });

      expect(result?.started).toBe(true);
    });
  });

  it("admits a waiter only after the last worker that kept the inherited descriptor exits", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: leavingWorkload(lock.dir) });
      await supervisor.exit;
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      const worker = workerPid(lock.dir);

      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, label.waiter, 1),
      });
      await delay(OBSERVATION_MS);
      const admittedWhileWorkerAlive = intervalStarted(lock.dir, label.waiter);
      const workerAliveAtObservation = isAlive(worker);
      process.kill(worker, SIGNAL.KILL);
      await waiter;

      expect(workerAliveAtObservation).toBe(true);
      expect(admittedWhileWorkerAlive).toBe(false);
      expect(intervalStarted(lock.dir, label.waiter)).toBe(true);
    });
  });
});

describe("terminal result of a child that exits 3", () => {
  it("reports started true, status completed, childExitCode 3, and exits 3", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: exitingWorkload(3) });

      const exit = await supervisor.exit;

      expect(exit.code).toBe(3);
      expect(supervisor.resultLine()).toMatchObject({
        schema: RESULT_SCHEMA,
        started: true,
        status: RESULT_STATUS.COMPLETED,
        childExitCode: 3,
      });
    });
  });
});
