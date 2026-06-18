import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { OCCUPANCY_CLAIM, type OccupancyFileSystem, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createRecordingOccupancyFileSystem, OCCUPANCY_FS_OP } from "@testing/harnesses/worktree/harness";

type OccupancyReadFile = OccupancyFileSystem extends {
  readFile: infer ReadFile extends (...args: never[]) => Promise<string>;
} ? ReadFile : never;

class PausingClaimWriteFileSystem implements OccupancyFileSystem {
  private resumeWrite: (() => void) | undefined;
  private readonly tempWritten: Promise<void>;
  private markTempWritten: (() => void) | undefined;

  constructor(private readonly backing: OccupancyFileSystem) {
    this.tempWritten = new Promise((resolve) => {
      this.markTempWritten = resolve;
    });
  }

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    await this.backing.mkdir(path, options);
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.backing.writeFile(path, data);
    this.markTempWritten?.();
    await new Promise<void>((resolve) => {
      this.resumeWrite = resolve;
    });
  }

  async rename(from: string, to: string): Promise<void> {
    await this.backing.rename(from, to);
  }

  async readFile(...args: Parameters<OccupancyReadFile>): Promise<string> {
    return this.backing.readFile(...args);
  }

  async rm(path: string, options?: { readonly force?: boolean }): Promise<void> {
    await this.backing.rm(path, options);
  }

  async waitUntilTempWritten(): Promise<void> {
    await this.tempWritten;
  }

  continueWrite(): void {
    this.resumeWrite?.();
  }
}

describe("worktree occupancy claim store properties", () => {
  it("round-trips any claim record through write then read", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (worktreesDir) => {
      await fc.assert(
        fc.asyncProperty(
          WORKTREE_TEST_GENERATOR.worktreeName(),
          WORKTREE_TEST_GENERATOR.claimRecord(),
          WORKTREE_TEST_GENERATOR.writeToken(),
          async (name, record, writeToken) => {
            const written = await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, writeToken });
            expect(written.ok).toBe(true);

            const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(readBack.ok).toBe(true);
            if (!readBack.ok) throw new Error(readBack.error);
            expect(readBack.value).toEqual(record);
          },
        ),
        { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
      );
    });
  });

  it("writes the claim atomically — concurrent reads observe no claim until rename publishes the complete record", async () => {
    await fc.assert(
      fc.asyncProperty(
        WORKTREE_TEST_GENERATOR.tempPrefix(),
        WORKTREE_TEST_GENERATOR.worktreeName(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.writeToken(),
        async (prefix, name, record, writeToken) => {
          await withTempDir(prefix, async (worktreesDir) => {
            const pausing = new PausingClaimWriteFileSystem(defaultOccupancyFileSystem);
            const recording = createRecordingOccupancyFileSystem(pausing);
            const write = writeClaim(worktreesDir, name, record, { fs: recording, writeToken });

            await pausing.waitUntilTempWritten();

            const concurrentRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(concurrentRead.ok).toBe(true);
            if (!concurrentRead.ok) throw new Error(concurrentRead.error);
            expect(concurrentRead.value).toBeUndefined();

            pausing.continueWrite();
            const written = await write;
            expect(written.ok).toBe(true);
            if (!written.ok) throw new Error(written.error);
            const claimPath = written.value;

            const writeCall = recording.calls.find((call) => call.op === OCCUPANCY_FS_OP.WRITE_FILE);
            const renameCall = recording.calls.find((call) => call.op === OCCUPANCY_FS_OP.RENAME);
            expect(writeCall).toBeDefined();
            expect(renameCall).toBeDefined();

            const writtenPath = writeCall?.paths[0];
            expect(writtenPath).not.toBe(claimPath);
            expect(writtenPath?.endsWith(OCCUPANCY_CLAIM.TEMP_EXTENSION)).toBe(true);
            expect(renameCall?.paths[0]).toBe(writtenPath);
            expect(renameCall?.paths[1]).toBe(claimPath);
            expect(claimPath.endsWith(OCCUPANCY_CLAIM.FILE_EXTENSION)).toBe(true);

            const finalRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(finalRead.ok).toBe(true);
            if (!finalRead.ok) throw new Error(finalRead.error);
            expect(finalRead.value).toEqual(record);
          });
        },
      ),
      { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
    );
  });
});
