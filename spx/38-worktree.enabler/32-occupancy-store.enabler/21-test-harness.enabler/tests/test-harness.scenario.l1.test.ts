import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createRecordingOccupancyFileSystem, OCCUPANCY_FS_OP } from "@testing/harnesses/worktree/harness";

/** A filesystem-safe path segment drawn from the config-key generator. */
function segment(): string {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
}

describe("recording OccupancyFileSystem double", () => {
  it("records each operation in invocation order with its op tag and path arguments", async () => {
    await withTempDir(segment(), async (root) => {
      const subdirectory = join(root, segment());
      const source = join(subdirectory, segment());
      const target = join(subdirectory, segment());
      const recording = createRecordingOccupancyFileSystem(defaultOccupancyFileSystem);

      await recording.mkdir(subdirectory, { recursive: true });
      await recording.writeFile(source, segment());
      await recording.rename(source, target);
      await recording.readFile(target, STATE_STORE_TEXT_ENCODING);
      await recording.rm(target);

      expect([...recording.calls]).toEqual([
        { op: OCCUPANCY_FS_OP.MKDIR, paths: [subdirectory] },
        { op: OCCUPANCY_FS_OP.WRITE_FILE, paths: [source] },
        { op: OCCUPANCY_FS_OP.RENAME, paths: [source, target] },
        { op: OCCUPANCY_FS_OP.READ_FILE, paths: [target] },
        { op: OCCUPANCY_FS_OP.RM, paths: [target] },
      ]);
    });
  });

  it("delegates each operation to the backing filesystem so its effect is observable", async () => {
    await withTempDir(segment(), async (root) => {
      const subdirectory = join(root, segment());
      const source = join(subdirectory, segment());
      const target = join(subdirectory, segment());
      const content = segment();
      const recording = createRecordingOccupancyFileSystem(defaultOccupancyFileSystem);

      await recording.mkdir(subdirectory, { recursive: true });
      await recording.writeFile(source, content);
      await recording.rename(source, target);

      expect(await recording.readFile(target, STATE_STORE_TEXT_ENCODING)).toBe(content);

      await recording.rm(target);
      await expect(recording.readFile(target, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
    });
  });
});
