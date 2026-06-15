import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { defaultOccupancyFileSystem, OCCUPANCY_CLAIM, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createRecordingOccupancyFileSystem, OCCUPANCY_FS_OP } from "@testing/harnesses/worktree/harness";

describe("worktree occupancy claim store properties", () => {
  it("round-trips any claim record through write then read", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (worktreesDir) => {
      await fc.assert(
        fc.asyncProperty(
          WORKTREE_TEST_GENERATOR.worktreeName(),
          WORKTREE_TEST_GENERATOR.claimRecord(),
          async (name, record) => {
            const written = await writeClaim(worktreesDir, name, record);
            expect(written.ok).toBe(true);

            const readBack = await readClaim(worktreesDir, name);
            expect(readBack.ok).toBe(true);
            if (!readBack.ok) throw new Error(readBack.error);
            expect(readBack.value).toEqual(record);
          },
        ),
        { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
      );
    });
  });

  it("writes the claim atomically — the data write targets a temp path that rename moves onto the claim path", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());

    await withTempDir(prefix, async (worktreesDir) => {
      const recording = createRecordingOccupancyFileSystem(defaultOccupancyFileSystem);
      const written = await writeClaim(worktreesDir, name, record, { fs: recording });
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
    });
  });
});
