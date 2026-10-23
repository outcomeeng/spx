/**
 * Lock file discipline: directories are created 0700, the file 0600, the file is rewritten only
 * in place — one inode for its whole life — and the guard starts its command only on the supported
 * platform, through a regular lock file the invoking account owns, whose inode is the one it locked.
 */

import { statSync } from "node:fs";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createHostCommandLock,
  defaultFilesystem,
  defaultLockBinding,
  DIRECTORY_MODE,
  FILE_MODE,
  readHolderRecord,
  RESULT_STATUS,
} from "@/lib/host-command-lock";
import {
  arbitraryDistinctLabels,
  arbitraryPathSegment,
  UNSUPPORTED_PLATFORMS,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  missingDirectoryLockPath,
  OBSERVATION_MS,
  permissionsOf,
  replacingBinding,
  SIGNAL,
  signalGroup,
  sizeOf,
  startSupervisor,
  symlinkedLockPath,
  waitUntil,
  withLockEnv,
  workerActive,
  workerPidRecorded,
  workerWorkload,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const probeLabel = sampleGeneratedValue(arbitraryPathSegment());
const missingSegments = sampleGeneratedValue(arbitraryDistinctLabels(2));

describe("the orchestration lock file", () => {
  it("is created with mode 0600 inside missing directories created with mode 0700", async () => {
    await withLockEnv(async (lock) => {
      const nested = missingDirectoryLockPath(lock.dir, missingSegments);
      const guard = createHostCommandLock(dilatedDeps(nested));

      await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });

      expect(permissionsOf(nested)).toBe(FILE_MODE);
      expect(permissionsOf(dirname(nested))).toBe(DIRECTORY_MODE);
      expect(permissionsOf(dirname(dirname(nested)))).toBe(DIRECTORY_MODE);
    });
  });

  it("keeps one inode across successive runs and across a holder record rewrite", async () => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock(dilatedDeps(lock.lockPath));
      await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });
      const before = statSync(lock.lockPath).ino;

      const supervisor = startSupervisor(lock, { command: workerWorkload(lock.dir) });
      await waitUntil(() => workerPidRecorded(lock.dir) && workerActive(lock.dir));
      await waitUntil(() => readHolderRecord(lock.lockPath).childProcessGroup !== null);
      const during = statSync(lock.lockPath).ino;
      signalGroup(supervisor, SIGNAL.TERM);
      await supervisor.exit;
      await guard.run({ command: intervalWorkload(lock.dir, probeLabel, OBSERVATION_MS / 100) });

      expect(during).toBe(before);
      expect(statSync(lock.lockPath).ino).toBe(before);
    });
  });
});

describe("the guard's start boundary", () => {
  it.each(UNSUPPORTED_PLATFORMS)("fails an unsupported platform ($os $arch) before start", async (platform) => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock({ ...dilatedDeps(lock.lockPath), platform });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.UNSUPPORTED_PLATFORM });
      expect(intervalStarted(lock.dir, probeLabel)).toBe(false);
    });
  });

  it("fails a lock path that is a symbolic link before start, and tries no alternate path", async () => {
    await withLockEnv(async (lock) => {
      const { target, link } = symlinkedLockPath(lock.dir);
      const guard = createHostCommandLock(dilatedDeps(link));

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, probeLabel)).toBe(false);
      expect(sizeOf(target)).toBe(0);
    });
  });

  it("fails a lock file another account owns before start", async () => {
    await withLockEnv(async (lock) => {
      const foreignOwner = (process.getuid?.() ?? 0) + 1;
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        filesystem: { ...defaultFilesystem, ownerOf: () => foreignOwner },
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, probeLabel)).toBe(false);
    });
  });

  it("fails a lock file whose inode differs from the one it locked before start", async () => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        binding: replacingBinding(lock.lockPath, defaultLockBinding),
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, probeLabel, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, probeLabel)).toBe(false);
    });
  });
});
