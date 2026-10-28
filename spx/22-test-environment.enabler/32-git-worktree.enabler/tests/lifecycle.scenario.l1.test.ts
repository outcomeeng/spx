import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
} from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("withGitWorktreeEnv — startup", () => {
  it("initializes productDir under os.tmpdir() as a git repo with configured identity", async () => {
    let observedProductDir = "";
    let observedEmail = "";
    let observedUserName = "";

    await withGitWorktreeEnv(async (env) => {
      observedProductDir = env.productDir;
      observedEmail = await readGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY]);
      observedUserName = await readGit(env.productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY]);
    });

    expect(observedProductDir.startsWith(tmpdir())).toBe(true);
    expect(observedEmail).toBe(GIT_TEST_CONFIG.EMAIL);
    expect(observedUserName).toBe(GIT_TEST_CONFIG.USER_NAME);
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
  const ceilingKey = GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES;
  let priorCeiling: string | undefined;
  let callerCeiling = "";

  beforeEach(() => {
    priorCeiling = process.env[ceilingKey];
    callerCeiling = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.ceilingDirectory());
    process.env[ceilingKey] = callerCeiling;
  });

  afterEach(() => {
    if (priorCeiling === undefined) {
      delete process.env[ceilingKey];
    } else {
      process.env[ceilingKey] = priorCeiling;
    }
  });

  it("holds the caller's value during the callback and after it returns", async () => {
    let observedInside: string | undefined;

    await withGitWorktreeEnv(async () => {
      observedInside = process.env[ceilingKey];
    });

    expect(observedInside).toBe(callerCeiling);
    expect(process.env[ceilingKey]).toBe(callerCeiling);
  });

  it("holds the caller's value during the callback and after it throws", async () => {
    let observedInside: string | undefined;
    const thrownError = new Error("intentional ceiling failure");

    await expect(
      withGitWorktreeEnv(async () => {
        observedInside = process.env[ceilingKey];
        throw thrownError;
      }),
    ).rejects.toBe(thrownError);

    expect(observedInside).toBe(callerCeiling);
    expect(process.env[ceilingKey]).toBe(callerCeiling);
  });
});
