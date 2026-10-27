/**
 * Scratch scenario over a real filesystem: a product-local scratch directory lives under the product's
 * scratch parent with the scratch prefix and is gone once released.
 */

import { existsSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryProductSegments } from "@testing/generators/temp-directory/temp-directory";
import { withTempDirectoryHost } from "@testing/harnesses/temp-directory/temp-directory";

describe("a product-local scratch request", () => {
  it("creates the directory under the scratch parent with the scratch prefix and removes it at release", async () => {
    await withTempDirectoryHost(async (host) => {
      const run = host.openRun();
      const productDirectory = host.createProductDirectory(
        run.worktreeRoot,
        sampleGeneratedValue(arbitraryProductSegments()),
      );

      const scratch = await run.tempDirectory.createScratchDirectory(productDirectory);

      expect(dirname(scratch)).toBe(join(productDirectory, ...TEMP_DIRECTORY_PATH.SCRATCH_PARENT_SEGMENTS));
      expect(basename(scratch).startsWith(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX)).toBe(true);
      expect(basename(scratch).length).toBeGreaterThan(TEMP_DIRECTORY_PATH.SCRATCH_PREFIX.length);
      expect(statSync(scratch).isDirectory()).toBe(true);

      run.tempDirectory.releaseScratchDirectory(scratch);

      expect(existsSync(scratch)).toBe(false);
    });
  });
});
