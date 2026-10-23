/**
 * Start boundary: the guard starts its command only on the supported platform, through a regular
 * lock file the invoking account owns, whose inode is the one it locked.
 */

import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createHostCommandLock, defaultFilesystem, defaultLockBinding, RESULT_STATUS } from "@/lib/host-command-lock";
import { UNSUPPORTED_PLATFORMS } from "@testing/generators/host-command-lock/host-command-lock";
import {
  dilatedDeps,
  intervalStarted,
  intervalWorkload,
  replacingBinding,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

const PROBE = "probe";
const TARGET_FILE_NAME = "target";
const LINK_FILE_NAME = "link";

describe("the guard's start boundary", () => {
  it.each(UNSUPPORTED_PLATFORMS)("fails an unsupported platform ($os $arch) before start", async (platform) => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock({ ...dilatedDeps(lock.lockPath), platform });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.UNSUPPORTED_PLATFORM });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });

  it("fails a lock path that is a symbolic link before start, and tries no alternate path", async () => {
    await withLockEnv(async (lock) => {
      const target = join(lock.dir, TARGET_FILE_NAME);
      const link = join(lock.dir, LINK_FILE_NAME);
      writeFileSync(target, "");
      symlinkSync(target, link);
      const guard = createHostCommandLock(dilatedDeps(link));

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
      expect(readFileSync(target, "utf8")).toBe("");
    });
  });

  it("fails a lock file another account owns before start", async () => {
    await withLockEnv(async (lock) => {
      const foreignOwner = (process.getuid?.() ?? 0) + 1;
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        filesystem: { ...defaultFilesystem, ownerOf: () => foreignOwner },
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });

  it("fails a lock file whose inode differs from the one it locked before start", async () => {
    await withLockEnv(async (lock) => {
      const guard = createHostCommandLock({
        ...dilatedDeps(lock.lockPath),
        binding: replacingBinding(lock.lockPath, defaultLockBinding),
      });

      const { result } = await guard.run({ command: intervalWorkload(lock.dir, PROBE, 1) });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(intervalStarted(lock.dir, PROBE)).toBe(false);
    });
  });
});
