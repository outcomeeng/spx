import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveProductDir } from "@/domains/config/root";
import {
  detectGitCommonDirProductRoot,
  detectWorktreeProductRoot,
  GIT_ROOT_COMMAND,
  type GitDependencies,
} from "@/git/root";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function createGitDeps(worktreeProductDir: string, gitCommonDirProductDir?: string): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (args.includes(GIT_ROOT_COMMAND.SHOW_TOPLEVEL)) {
        return { exitCode: 0, stdout: worktreeProductDir, stderr: "" };
      }
      if (args.includes(GIT_ROOT_COMMAND.GIT_COMMON_DIR) && gitCommonDirProductDir !== undefined) {
        const commonDirName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
        return { exitCode: 0, stdout: join(gitCommonDirProductDir, commonDirName), stderr: "" };
      }
      return { exitCode: 128, stdout: "", stderr: "" };
    },
  };
}

describe("product directory API result shape", () => {
  it("resolveProductDir exposes productDir without legacy root aliases", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = resolveProductDir(productDir);
      const legacyFieldNames = ["projectRoot", "projectDir"] as const;

      expect(result.productDir).toBe(productDir);
      for (const legacyField of legacyFieldNames) {
        expect(legacyField in result).toBe(false);
      }
    });
  });

  it("git root helpers expose productDir without an unqualified root field", async () => {
    const gitCommonDirProductDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const worktreeProductDir = join(
      gitCommonDirProductDir,
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    );
    const deps = createGitDeps(worktreeProductDir, gitCommonDirProductDir);

    const worktreeResult = await detectWorktreeProductRoot(worktreeProductDir, deps);
    const gitCommonDirResult = await detectGitCommonDirProductRoot(worktreeProductDir, deps);
    const legacyFields = { root: worktreeProductDir };

    expect(worktreeResult.productDir).toBe(worktreeProductDir);
    expect(gitCommonDirResult.productDir).toBe(gitCommonDirProductDir);
    for (const legacyField of Object.keys(legacyFields)) {
      expect(legacyField in worktreeResult).toBe(false);
      expect(legacyField in gitCommonDirResult).toBe(false);
    }
  });
});
