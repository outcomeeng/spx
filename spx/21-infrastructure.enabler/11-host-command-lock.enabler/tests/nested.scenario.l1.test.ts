/**
 * Nested guarded calls: a call carrying the inherited descriptor of the lock that still holds it
 * belongs to the outer command's tree.
 */

import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createHostCommandLock } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  isAlive,
  nestedSupervisorWorkload,
  OBSERVATION_MS,
  pgidWorkload,
  readGroups,
  signalGroup,
  startSupervisor,
  waitUntil,
  withLockEnv,
  workerActive,
  workerPid,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const WAITER = "waiter";

describe("a nested guarded call", () => {
  it("stops every inner process when the outer supervisor is interrupted, and admits no second outer command while a worker keeps its descriptor", async () => {
    await withLockEnv(async (lock) => {
      const outer = startSupervisor(lock, { command: nestedSupervisorWorkload({ command: workerWorkload(lock.dir) }) });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      const worker = workerPid(lock.dir);

      const waiter = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, WAITER, 1),
      });
      await delay(OBSERVATION_MS);
      const admittedWhileWorkerRuns = intervalStarted(lock.dir, WAITER);
      signalGroup(outer, "SIGTERM");
      await outer.exit;
      await waitUntil(() => !isAlive(worker));
      await waiter;

      expect(admittedWhileWorkerRuns).toBe(false);
      expect(isAlive(worker)).toBe(false);
      expect(intervalStarted(lock.dir, WAITER)).toBe(true);
    });
  });

  it("starts its command at once in the inherited process group and writes no result line of its own", async () => {
    await withLockEnv(async (lock) => {
      const outer = startSupervisor(lock, {
        command: nestedSupervisorWorkload({ command: pgidWorkload(lock.dir), waitSeconds: 1 }),
      });

      const exit = await outer.exit;
      const lines = outer.stderr().trim().split("\n").filter((line) => line.startsWith("{"));
      const groups = readGroups(lock.dir);

      expect(exit.code).toBe(0);
      expect(groups.own).toBe(groups.parent);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ started: true });
    });
  });
});
