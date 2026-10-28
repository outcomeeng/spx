import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { GIT_CEILING_DIRECTORIES_KEY } from "@/lib/git/environment";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_STRIPPED_ENVIRONMENT_KEYS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
} from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withProcessEnv } from "@testing/harnesses/process-env/process-env";

describe("withGitWorktreeEnv — startup", () => {
  it("initializes productDir under os.tmpdir() as a git repo with configured identity and strips GIT_* variables except the ceiling", async () => {
    const callerValues = sampleGitWorktreeTestValue(
      GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
    );
    let observedProductDir = "";
    let observedEmail = "";
    let observedUserName = "";
    const observedInside: Record<string, string | undefined> = {};

    await withProcessEnv(callerValues, async () => {
      await withGitWorktreeEnv(async (env) => {
        observedProductDir = env.productDir;
        observedEmail = await readGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY]);
        observedUserName = await readGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY]);
        for (const key of Object.keys(callerValues)) {
          observedInside[key] = process.env[key];
        }
      });
    });

    expect(observedProductDir.startsWith(tmpdir())).toBe(true);
    expect(observedEmail).toBe(GIT_TEST_CONFIG.EMAIL);
    expect(observedUserName).toBe(GIT_TEST_CONFIG.USER_NAME);
    for (const key of GIT_TEST_STRIPPED_ENVIRONMENT_KEYS) {
      expect(observedInside[key]).toBeUndefined();
    }
    expect(observedInside[GIT_CEILING_DIRECTORIES_KEY]).toBe(callerValues[GIT_CEILING_DIRECTORIES_KEY]);
  });
});

describe("withGitWorktreeEnv — cleanup", () => {
  it("removes productDir and restores GIT_CONFIG_GLOBAL after the callback returns normally", async () => {
    const priorGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
    let observedProductDir = "";

    await withGitWorktreeEnv(async (env) => {
      observedProductDir = env.productDir;
    });

    expect(existsSync(observedProductDir)).toBe(false);
    expect(process.env.GIT_CONFIG_GLOBAL).toBe(priorGitConfigGlobal);
  });

  it("removes productDir, restores GIT_CONFIG_GLOBAL, and rethrows when the callback throws", async () => {
    const priorGitConfigGlobal = process.env.GIT_CONFIG_GLOBAL;
    let observedProductDir = "";
    const thrownError = new Error("intentional callback failure");

    await expect(
      withGitWorktreeEnv(async (env) => {
        observedProductDir = env.productDir;
        throw thrownError;
      }),
    ).rejects.toBe(thrownError);

    expect(existsSync(observedProductDir)).toBe(false);
    expect(process.env.GIT_CONFIG_GLOBAL).toBe(priorGitConfigGlobal);
  });
});

describe("withGitWorktreeEnv — GIT_CEILING_DIRECTORIES", () => {
  it("holds the caller's value during the callback and after it returns", async () => {
    const callerCeiling = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.ceilingDirectory());
    let observedInside: string | undefined;
    let observedAfter: string | undefined;

    await withProcessEnv({ [GIT_CEILING_DIRECTORIES_KEY]: callerCeiling }, async () => {
      await withGitWorktreeEnv(async () => {
        observedInside = process.env[GIT_CEILING_DIRECTORIES_KEY];
      });
      observedAfter = process.env[GIT_CEILING_DIRECTORIES_KEY];
    });

    expect(observedInside).toBe(callerCeiling);
    expect(observedAfter).toBe(callerCeiling);
  });

  it("holds the caller's value during the callback and after it throws", async () => {
    const callerCeiling = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.ceilingDirectory());
    const thrownError = new Error("intentional ceiling failure");
    let observedInside: string | undefined;
    let observedAfter: string | undefined;

    await withProcessEnv({ [GIT_CEILING_DIRECTORIES_KEY]: callerCeiling }, async () => {
      await expect(
        withGitWorktreeEnv(async () => {
          observedInside = process.env[GIT_CEILING_DIRECTORIES_KEY];
          throw thrownError;
        }),
      ).rejects.toBe(thrownError);
      observedAfter = process.env[GIT_CEILING_DIRECTORIES_KEY];
    });

    expect(observedInside).toBe(callerCeiling);
    expect(observedAfter).toBe(callerCeiling);
  });
});
