/**
 * A nested call whose inherited descriptor is absent, changed, or no longer holds the lock never
 * starts its command, and a nested call naming another lock file fails before its command starts.
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, LOCK_ENV, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  nestedSupervisorWorkloadWithEnv,
  openDescriptor,
  startSupervisor,
  touchedFileId,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const PROBE = "probe";
const OTHER_FILE_NAME = "other-file";

describe("a nested guarded call with an invalid context", () => {
  it("fails nested_context_invalid when its descriptor is absent", async () => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        environment: { ...lock.env, [LOCK_ENV.FILE_ID]: touchedFileId(lock.lockPath) },
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NESTED_CONTEXT_INVALID });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });

  it("fails nested_context_invalid when its descriptor is a different file than the lock file", async () => {
    await withLockEnv(async (lock) => {
      const lockFileId = touchedFileId(lock.lockPath);
      const other = openDescriptor(join(lock.dir, OTHER_FILE_NAME));
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        environment: { ...lock.env, [LOCK_ENV.FD]: String(other.fd), [LOCK_ENV.FILE_ID]: lockFileId },
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });
      other.close();

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NESTED_CONTEXT_INVALID });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });

  it("fails nested_context_invalid when its descriptor is the lock file but no longer holds the lock", async () => {
    await withLockEnv(async (lock) => {
      touchedFileId(lock.lockPath);
      const unlocked = openDescriptor(lock.lockPath);
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        environment: { ...lock.env, [LOCK_ENV.FD]: String(unlocked.fd), [LOCK_ENV.FILE_ID]: unlocked.fileId },
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });
      unlocked.close();

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.NESTED_CONTEXT_INVALID });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });

  it("fails nested_lock_mismatch when it resolves a different orchestration lock file than the outer one", async () => {
    await withLockEnv(async (outerLock) => {
      await withLockEnv(async (otherLock) => {
        const outer = startSupervisor(outerLock, {
          command: nestedSupervisorWorkloadWithEnv(
            { command: intervalWorkload(otherLock.dir, PROBE, 1), waitSeconds: 1 },
            { [LOCK_ENV.PATH_OVERRIDE]: otherLock.lockPath },
          ),
        });

        const exit = await outer.exit;

        expect(exit.code).not.toBe(0);
        expect(outer.stderr()).toContain(RESULT_STATUS.NESTED_LOCK_MISMATCH);
        expect(intervalStarted(otherLock.dir, PROBE)).toBe(false);
      });
    });
  });
});
