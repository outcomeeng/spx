/**
 * Lock file discipline: directories are created 0700, the file 0600, and the file is rewritten
 * only in place — one inode for its whole life.
 */

import { statSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, DIRECTORY_MODE, FILE_MODE, readHolderRecord } from "@/lib/host-command-lock";
import { arbitraryPathSegment } from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  dilatedDeps,
  intervalWorkload,
  OBSERVATION_MS,
  startSupervisor,
  waitUntil,
  withLockEnv,
  workerActive,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const MODE_MASK = 0o777;
const PROBE = "probe";

describe("the orchestration lock file", () => {
  it("is created with mode 0600 inside missing directories created with mode 0700", async () => {
    await withLockEnv(async (lock) => {
      const nested = join(
        lock.dir,
        sampleGeneratedValue(arbitraryPathSegment()),
        sampleGeneratedValue(arbitraryPathSegment()),
        "orchestration.lock",
      );
      const guard = createHostCommandLock(dilatedDeps(nested));

      await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(statSync(nested).mode & MODE_MASK).toBe(FILE_MODE);
      expect(statSync(dirname(nested)).mode & MODE_MASK).toBe(DIRECTORY_MODE);
      expect(statSync(dirname(dirname(nested))).mode & MODE_MASK).toBe(DIRECTORY_MODE);
    });
  });

  it("keeps one inode across successive runs and across a holder record rewrite", async () => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock(dilatedDeps(lock.lockPath));
      await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });
      const before = statSync(lock.lockPath).ino;

      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir) });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      await waitUntil(() => readHolderRecord(lock.lockPath).childProcessGroup !== null);
      const during = statSync(lock.lockPath).ino;
      process.kill(-supervisor.pid, "SIGTERM");
      await supervisor.exit;
      await guard.run({ command: intervalWorkload(lock.dir, PROBE, OBSERVATION_MS / 100) });

      expect(during).toBe(before);
      expect(statSync(lock.lockPath).ino).toBe(before);
    });
  });
});
