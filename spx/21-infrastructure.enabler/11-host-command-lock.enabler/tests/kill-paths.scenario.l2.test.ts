/**
 * Signal forwarding: signals a harness kill path delivers to the supervisor's group stop the
 * guarded tree and release the slot, while a supervisor SIGKILL leaves the tree holding the slot.
 */

import { constants as osConstants } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, readHolderRecord, SIGNAL_EXIT_CODE_BASE } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  isAlive,
  OBSERVATION_MS,
  signalGroup,
  signalSupervisor,
  startSupervisor,
  waitUntil,
  withLockEnv,
  workerActive,
  workerPid,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const WAITER = "waiter";

describe("a running guarded command receiving a harness kill path's signal", () => {
  it.each(["SIGTERM", "SIGHUP"] as const)(
    "stops the guarded tree and releases the slot when its supervisor's group receives %s",
    async (signal) => {
      await withLockEnv(async (lock) => {
        const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir) });
        await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
        const worker = workerPid(lock.dir);

        signalGroup(supervisor, signal);
        const exit = await supervisor.exit;
        await waitUntil(() => !isAlive(worker));
        const { result } = await createHostCommandLock(dilatedDeps(lock.lockPath)).run({
          command: intervalWorkload(lock.dir, WAITER, 1),
        });

        expect(exit.code).toBe(SIGNAL_EXIT_CODE_BASE + osConstants.signals[signal]);
        expect(result?.started).toBe(true);
      });
    },
  );

  it("leaves the tree holding the slot under its holder record when the supervisor receives SIGKILL", async () => {
    await withLockEnv(async (lock) => {
      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir) });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      const worker = workerPid(lock.dir);

      signalSupervisor(supervisor, "SIGKILL");
      await supervisor.exit;
      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, WAITER, 1),
      });
      await delay(OBSERVATION_MS);
      const record = readHolderRecord(lock.lockPath);
      const admittedWhileWorkerAlive = intervalStarted(lock.dir, WAITER);
      const workerAliveAtObservation = isAlive(worker);
      process.kill(worker, "SIGKILL");
      await waiter;

      expect(workerAliveAtObservation).toBe(true);
      expect(admittedWhileWorkerAlive).toBe(false);
      expect(record.supervisorPid).toBe(supervisor.pid);
    });
  });
});
