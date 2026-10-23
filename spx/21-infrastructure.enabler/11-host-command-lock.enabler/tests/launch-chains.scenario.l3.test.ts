/**
 * Supported launch chains: for each of the four real chains, the slot stays held from admission
 * until the last process exits — at normal completion, at the supervisor's death, at the runner's
 * death with workers surviving, and at the loss of every wrapper with workers remaining. A
 * competing admission is attempted while a worker is observed active through its own heartbeat.
 */

import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  activeWorkerPids,
  CHAIN_TEST_TIMEOUT_MS,
  childPids,
  competitorStarted,
  descendantPids,
  holdersOf,
  startChain,
  startCompetitor,
  stopWorkers,
  SUPPORTED_CHAINS,
  withChainDir,
} from "@testing/harnesses/host-command-lock/chains";
import {
  OBSERVATION_MS,
  SIGNAL,
  signalSupervisor,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

describe("supported launch chains", () => {
  it.each(SUPPORTED_CHAINS)(
    "$name holds the slot from admission until the run's last process exits",
    async (chain) => {
      await withLockEnv(async (lock) => {
        await withChainDir(async (dir) => {
          const running = startChain(lock, chain, dir);
          await running.workersActive();

          const competitor = startCompetitor(lock, dir);
          await delay(OBSERVATION_MS);
          const admittedWhileActive = competitorStarted(dir);
          const workersDuringObservation = activeWorkerPids(dir);
          stopWorkers(dir);
          await running.supervisor.exit;
          await competitor;

          expect(workersDuringObservation.length).toBeGreaterThan(0);
          expect(admittedWhileActive).toBe(false);
          expect(competitorStarted(dir)).toBe(true);
        });
      });
    },
    CHAIN_TEST_TIMEOUT_MS,
  );

  it.each(SUPPORTED_CHAINS)(
    "$name keeps a competing admission out while workers run after its supervisor receives SIGKILL",
    async (chain) => {
      await withLockEnv(async (lock) => {
        await withChainDir(async (dir) => {
          const running = startChain(lock, chain, dir);
          await running.workersActive();

          signalSupervisor(running.supervisor, SIGNAL.KILL);
          await running.supervisor.exit;
          const competitor = startCompetitor(lock, dir);
          await delay(OBSERVATION_MS);
          const admittedWhileActive = competitorStarted(dir);
          const workersDuringObservation = activeWorkerPids(dir);
          stopWorkers(dir);
          await competitor;

          expect(workersDuringObservation.length).toBeGreaterThan(0);
          expect(admittedWhileActive).toBe(false);
          expect(competitorStarted(dir)).toBe(true);
        });
      });
    },
    CHAIN_TEST_TIMEOUT_MS,
  );

  it.each(SUPPORTED_CHAINS)(
    "$name keeps a competing admission out while workers survive the runner's main process",
    async (chain) => {
      await withLockEnv(async (lock) => {
        await withChainDir(async (dir) => {
          const running = startChain(lock, chain, dir);
          await running.workersActive();

          const [runner] = childPids(running.supervisor.pid);
          process.kill(runner, SIGNAL.KILL);
          const competitor = startCompetitor(lock, dir);
          await delay(OBSERVATION_MS);
          const admittedWhileActive = competitorStarted(dir);
          const workersDuringObservation = activeWorkerPids(dir);
          stopWorkers(dir);
          await competitor;

          expect(workersDuringObservation.length).toBeGreaterThan(0);
          expect(admittedWhileActive).toBe(false);
          expect(competitorStarted(dir)).toBe(true);
        });
      });
    },
    CHAIN_TEST_TIMEOUT_MS,
  );

  it.each(SUPPORTED_CHAINS)(
    "$name keeps a competing admission out when only workers remain, with no wrapper holding the slot",
    async (chain) => {
      await withLockEnv(async (lock) => {
        await withChainDir(async (dir) => {
          const running = startChain(lock, chain, dir);
          await running.workersActive();

          const workers = activeWorkerPids(dir);
          const wrappers = [running.supervisor.pid, ...descendantPids(running.supervisor.pid)].filter(
            (pid) => !workers.includes(pid),
          );
          wrappers.forEach((pid) => {
            try {
              process.kill(pid, SIGNAL.KILL);
            } catch {
              // a wrapper that already exited needs no signal
            }
          });
          const competitor = startCompetitor(lock, dir);
          await delay(OBSERVATION_MS);
          const holders = holdersOf(lock.lockPath);
          const admittedWhileActive = competitorStarted(dir);
          const workersDuringObservation = activeWorkerPids(dir);
          stopWorkers(dir);
          await competitor;

          expect(workersDuringObservation.length).toBeGreaterThan(0);
          expect(holders.filter((pid) => wrappers.includes(pid))).toEqual([]);
          expect(admittedWhileActive).toBe(false);
          expect(competitorStarted(dir)).toBe(true);
        });
      });
    },
    CHAIN_TEST_TIMEOUT_MS,
  );
});
