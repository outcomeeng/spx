/**
 * Mutual exclusion: two guarded commands started from two repositories that resolve one
 * orchestration lock file never run at the same time.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock } from "@/lib/host-command-lock";
import {
  dilatedDeps,
  intervalWorkload,
  OBSERVATION_MS,
  readInterval,
  withLockEnv,
} from "@testing/harnesses/host-command-lock/host-command-lock";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const REPOSITORY_PREFIX = "host-command-lock-repo-";
const FIRST = "first";
const SECOND = "second";

describe("guarded commands that share an orchestration lock file", () => {
  it("run in intervals that never overlap", async () => {
    await withLockEnv(async (lock) => {
      await withTempDir(REPOSITORY_PREFIX, async (repositoryA) => {
        await withTempDir(REPOSITORY_PREFIX, async (repositoryB) => {
          const guard = createHostCommandLock(dilatedDeps(lock.lockPath));

          const reports = await Promise.all([
            guard.run({ command: intervalWorkload(lock.dir, FIRST, OBSERVATION_MS), cwd: repositoryA }),
            guard.run({ command: intervalWorkload(lock.dir, SECOND, OBSERVATION_MS), cwd: repositoryB }),
          ]);
          const first = readInterval(lock.dir, FIRST);
          const second = readInterval(lock.dir, SECOND);

          expect(reports.map((report) => report.result?.started)).toEqual([true, true]);
          expect(first.endMs <= second.startMs || second.endMs <= first.startMs).toBe(true);
        });
      });
    });
  });
});
