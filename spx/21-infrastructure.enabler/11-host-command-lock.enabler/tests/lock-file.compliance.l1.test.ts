/**
 * Lock file compliance over an in-memory host: the guard starts its command only on the supported
 * platform, through a lock file that opens, that the invoking account owns, that is a regular file
 * on local storage, and whose inode is the one it locked.
 */

import { describe, expect, it } from "vitest";

import { createHostCommandLock, RESULT_STATUS } from "@/lib/host-command-lock";
import {
  arbitraryCommand,
  arbitraryCpuCount,
  quietSample,
  UNSUPPORTED_PLATFORMS,
} from "@testing/generators/host-command-lock/host-command-lock";
import { arbitrarySpawnFailureMessage } from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost, type MemoryHostOptions } from "@testing/harnesses/host-command-lock/host-command-lock";

const CLEAN_EXIT = 0;
const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const command = sampleGeneratedValue(arbitraryCommand());
const refusal = new Error(sampleGeneratedValue(arbitrarySpawnFailureMessage()));
const OTHER_ACCOUNT_OFFSET = 1;

const VIOLATING_LOCK_FILES: ReadonlyArray<readonly [string, Partial<MemoryHostOptions>]> = [
  ["fails to open", { openFailure: refusal }],
  ["is owned by another account", { ownerUid: (process.getuid?.() as number) + OTHER_ACCOUNT_OFFSET }],
  ["is not a regular file", { regularFile: false }],
  ["lies on storage that is not local", { localStorage: false }],
  ["is replaced by a different inode when the lock is taken", { pathReplacedOnLock: true }],
];

describe("the guard on a platform other than macOS arm64", () => {
  it.each(UNSUPPORTED_PLATFORMS)("fails $os $arch before it opens the lock file or starts the command", async (platform) => {
    const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

    const { exitCode, result } = await createHostCommandLock(host.deps({ platform, childExitCode: CLEAN_EXIT })).run({
      command,
    });

    expect(result).toMatchObject({ started: false, status: RESULT_STATUS.UNSUPPORTED_PLATFORM });
    expect(exitCode).not.toBe(CLEAN_EXIT);
    expect(host.lockDescriptors()).toEqual([]);
    expect(host.spawns).toEqual([]);
  });
});

describe("the guard with a lock file that violates its discipline", () => {
  it.each(VIOLATING_LOCK_FILES)(
    "fails before start, tries no alternate path, and releases the descriptor when the lock file %s",
    async (_name, hostOptions) => {
      const host = new MemoryHost({ cpuCount, samples: [quietSample()], ...hostOptions });

      const { exitCode, result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT })).run({
        command,
      });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(exitCode).not.toBe(CLEAN_EXIT);
      expect(host.spawns).toEqual([]);
      expect(host.lockDescriptors().length).toBeLessThanOrEqual(1);
      expect(host.openSupervisorDescriptors()).toBe(0);
      expect(host.slotHeld()).toBe(false);
    },
  );
});
