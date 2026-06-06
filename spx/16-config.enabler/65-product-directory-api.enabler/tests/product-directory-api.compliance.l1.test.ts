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

// Every git command exits non-zero — the working directory is outside a repository.
function createNonGitDeps(): GitDependencies {
  return {
    execa: async () => ({ exitCode: 128, stdout: "", stderr: "" }),
  };
}

// Git invocation rejects outright (binary missing, permission error) — exercises the catch path.
function createThrowingGitDeps(): GitDependencies {
  return {
    execa: async () => {
      throw new Error(sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));
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
    expect(gitCommonDirResult.worktreeRoot).toBe(worktreeProductDir);
    expect("worktreeRoot" in worktreeResult).toBe(false);
    for (const legacyField of Object.keys(legacyFields)) {
      expect(legacyField in worktreeResult).toBe(false);
      expect(legacyField in gitCommonDirResult).toBe(false);
    }
  });

  it("detectGitCommonDirProductRoot returns worktreeRoot on every resolution path", async () => {
    const worktreeProductDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const gitCommonDirProductDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nonGitCwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    // Success: --show-toplevel and --git-common-dir both resolve; worktreeRoot is the toplevel.
    const success = await detectGitCommonDirProductRoot(
      worktreeProductDir,
      createGitDeps(worktreeProductDir, gitCommonDirProductDir),
    );
    expect(success.worktreeRoot).toBe(worktreeProductDir);

    // Fallback: --git-common-dir fails while --show-toplevel succeeds; productDir and worktreeRoot are the toplevel.
    const fallback = await detectGitCommonDirProductRoot(worktreeProductDir, createGitDeps(worktreeProductDir));
    expect(fallback.productDir).toBe(worktreeProductDir);
    expect(fallback.worktreeRoot).toBe(worktreeProductDir);

    // Non-git: --show-toplevel exits non-zero; worktreeRoot falls back to cwd.
    const nonGit = await detectGitCommonDirProductRoot(nonGitCwd, createNonGitDeps());
    expect(nonGit.isGitRepo).toBe(false);
    expect(nonGit.worktreeRoot).toBe(nonGitCwd);

    // Thrown: the git invocation rejects; the catch path still returns worktreeRoot as cwd.
    const thrown = await detectGitCommonDirProductRoot(nonGitCwd, createThrowingGitDeps());
    expect(thrown.isGitRepo).toBe(false);
    expect(thrown.worktreeRoot).toBe(nonGitCwd);
  });
});
