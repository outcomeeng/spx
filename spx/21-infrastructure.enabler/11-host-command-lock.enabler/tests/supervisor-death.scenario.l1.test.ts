/**
 * Supervisor death: the slot belongs to the descriptor the child inherited, so a killed supervisor
 * leaves the slot held until the last process holding the descriptor exits.
 */

import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, readHolderRecord } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  exitingWorkload,
  intervalStarted,
  intervalWorkload,
  isAlive,
  leavingWorkload,
  OBSERVATION_MS,
  RECORD_WRITE_AFTER_SPAWN,
  RECORD_WRITE_BEFORE_SPAWN,
  startSupervisor,
  waitUntil,
  withLockEnv,
  workerActive,
  workerPid,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const WAITER = "waiter";
const RUN_ID = "orphaned-run";
const SIGKILL = "SIGKILL";

describe("a supervisor killed while it holds the slot", () => {
  it("keeps the slot until the child exits and names the orphaned run in the holder record", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir), runId: RUN_ID });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      const worker = workerPid(lock.dir);
      process.kill(supervisor.pid, SIGKILL);
      await supervisor.exit;

      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, WAITER, 1),
      });
      await delay(OBSERVATION_MS);
      const record = readHolderRecord(lock.lockPath);
      const admittedWhileChildAlive = intervalStarted(lock.dir, WAITER);
      process.kill(worker, SIGKILL);
      await waiter;

      expect(admittedWhileChildAlive).toBe(false);
      expect(record).toMatchObject({
        runId: RUN_ID,
        supervisorPid: supervisor.pid,
        workingDirectory: process.cwd(),
      });
      expect(record.childProcessGroup).toBe(worker);
      expect(Number.isNaN(Date.parse(record.startedAt))).toBe(false);
      expect(intervalStarted(lock.dir, WAITER)).toBe(true);
    });
  });

  it("names the run with its child process group unknown when the supervisor dies before recording it", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir), runId: RUN_ID }, {
        killOnRecordWrite: RECORD_WRITE_AFTER_SPAWN,
      });
      await supervisor.exit;
      await waitUntil(() => workerPidRecorded(lock.dir));
      const worker = workerPid(lock.dir);

      const record = readHolderRecord(lock.lockPath);
      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, WAITER, 1),
      });
      await delay(OBSERVATION_MS);
      const admittedWhileChildAlive = intervalStarted(lock.dir, WAITER);
      process.kill(worker, SIGKILL);
      await waiter;

      expect(record.runId).toBe(RUN_ID);
      expect(record.childProcessGroup).toBeNull();
      expect(admittedWhileChildAlive).toBe(false);
    });
  });

  it("admits a waiter at once when the supervisor dies after taking the lock and before spawning", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: exitingWorkload(0), runId: RUN_ID }, {
        killOnRecordWrite: RECORD_WRITE_BEFORE_SPAWN,
      });
      await supervisor.exit;

      const { result } = await createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: exitingWorkload(0),
        waitSeconds: 1,
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
        command: intervalWorkload(lock.dir, WAITER, 1),
      });
      await delay(OBSERVATION_MS);
      const admittedWhileWorkerAlive = intervalStarted(lock.dir, WAITER);
      const workerAliveAtObservation = isAlive(worker);
      process.kill(worker, SIGKILL);
      await waiter;

      expect(workerAliveAtObservation).toBe(true);
      expect(admittedWhileWorkerAlive).toBe(false);
      expect(intervalStarted(lock.dir, WAITER)).toBe(true);
    });
  });
});
