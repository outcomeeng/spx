import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GIT_DIR_BASENAME } from "@/lib/git/root";
import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { observeGitDir } from "@testing/harnesses/state/nested-product-layout";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("state test harness — git directory observation beneath an ancestor repository", () => {
  it("reports no git directory until a repository is initialized at the root, then reports the local one", async () => {
    await withTempDir("spx-git-observation-ancestor-", async (ancestorDir) => {
      await runGit(ancestorDir, [GIT_TEST_SUBCOMMANDS.INIT]);
      const rootDir = join(ancestorDir, "root");
      await mkdir(rootDir);

      expect(await observeGitDir(rootDir)).toBeNull();

      await runGit(rootDir, [GIT_TEST_SUBCOMMANDS.INIT]);

      expect(await observeGitDir(rootDir)).toBe(GIT_DIR_BASENAME);
    });
  });
});
