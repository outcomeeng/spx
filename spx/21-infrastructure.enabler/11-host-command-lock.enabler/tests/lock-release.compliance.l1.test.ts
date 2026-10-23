/**
 * The binding's unlock is never called: a supervisor gives up its share only by closing its
 * descriptor after the child exits. Observed through a recording binding over the production one.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, defaultLockBinding, type LockBinding, RESULT_STATUS } from "@/lib/host-command-lock";
import { arbitraryExitCode } from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  dilatedDeps,
  exitingWorkload,
  intervalWorkload,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";

describe("lock release", () => {
  it.each([
    ["a child that exits", () => exitingWorkload(sampleGeneratedValue(arbitraryExitCode()))],
    ["a child that runs an interval", (dir: string) => intervalWorkload(dir, "probe", 1)],
  ])("never calls the binding's unlock for %s", async (_name, workload) => {
    await withLockEnv(async (lock) => {
      const unlockCalls: number[] = [];
      const recording: LockBinding = {
        ...defaultLockBinding,
        unlock: (fd: number) => {
          unlockCalls.push(fd);
          defaultLockBinding.unlock(fd);
        },
      };
      const guard = createHostCommandLock({ ...dilatedDeps(lock.lockPath), binding: recording });

      const { result } = await guard.run({ command: workload(lock.dir) });

      expect(result?.started).toBe(true);
      expect(unlockCalls).toEqual([]);
    });
  });

  it("never calls the binding's unlock when the run ends at the wait cap", async () => {
    await withLockEnv(async (lock) => {
      const unlockCalls: number[] = [];
      const holder = createHostCommandLock(dilatedDeps(lock.lockPath)).run({
        command: intervalWorkload(lock.dir, "holder", 300),
      });
      const recording: LockBinding = {
        ...defaultLockBinding,
        unlock: (fd: number) => {
          unlockCalls.push(fd);
        },
      };
      const guard = createHostCommandLock({ ...dilatedDeps(lock.lockPath), binding: recording });

      const { result } = await guard.run({ command: exitingWorkload(0), waitSeconds: 1 });
      await holder;

      expect(result?.status).toBe(RESULT_STATUS.NOT_READY);
      expect(unlockCalls).toEqual([]);
    });
  });
});
