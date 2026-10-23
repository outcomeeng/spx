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
  CLEAN_EXIT_CODE,
  quietSample,
  UNSUPPORTED_PLATFORMS,
} from "@testing/generators/host-command-lock/host-command-lock";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { MemoryHost, VIOLATING_LOCK_FILES } from "@testing/harnesses/host-command-lock/host-command-lock";

const cpuCount = sampleGeneratedValue(arbitraryCpuCount());
const command = sampleGeneratedValue(arbitraryCommand());
describe("the guard on a platform other than macOS arm64", () => {
  it.each(UNSUPPORTED_PLATFORMS)(
    "fails $os $arch before it opens the lock file or starts the command",
    async (platform) => {
      const host = new MemoryHost({ cpuCount, samples: [quietSample()] });

      const { exitCode, result } = await createHostCommandLock(host.deps({ platform, childExitCode: CLEAN_EXIT_CODE }))
        .run({
          command,
        });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.UNSUPPORTED_PLATFORM });
      expect(exitCode).not.toBe(CLEAN_EXIT_CODE);
      expect(host.lockDescriptors()).toEqual([]);
      expect(host.spawns).toEqual([]);
    },
  );
});

describe("the guard with a lock file that violates its discipline", () => {
  it.each(VIOLATING_LOCK_FILES)(
    "fails before start, tries no alternate path, and releases the descriptor when the lock file %s",
    async (_name, hostOptions) => {
      const host = new MemoryHost({ cpuCount, samples: [quietSample()], ...hostOptions });

      const { exitCode, result } = await createHostCommandLock(host.deps({ childExitCode: CLEAN_EXIT_CODE })).run({
        command,
      });

      expect(result).toMatchObject({ started: false, status: RESULT_STATUS.LOCK_FILE_ERROR });
      expect(exitCode).not.toBe(CLEAN_EXIT_CODE);
      expect(host.spawns).toEqual([]);
      expect(host.lockDescriptors().length).toBeLessThanOrEqual(1);
      expect(host.openSupervisorDescriptors()).toBe(0);
      expect(host.slotHeld()).toBe(false);
    },
  );
});
