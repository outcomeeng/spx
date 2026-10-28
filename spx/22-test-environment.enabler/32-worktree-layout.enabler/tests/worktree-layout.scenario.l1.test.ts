import { isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_ENVIRONMENT_KEYS } from "@testing/harnesses/git-test-constants";
import { withProcessEnv } from "@testing/harnesses/process-env/process-env";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("worktree layout test harness", () => {
  it("resolves a provisioned worktree by name and throws for an unprovisioned name", async () => {
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    // The generator's keys always start with a lowercase letter, so the uppercased
    // variant is guaranteed distinct from `name` and was never provisioned.
    const missing = name.toUpperCase();

    await withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, async (env) => {
      expect(env.worktree(name)).toBe(env.worktrees[name]);
      expect(isAbsolute(env.worktree(name))).toBe(true);
      expect(() => env.worktree(missing)).toThrow();
    });
  });

  it("throws when a non-bare layout declares no worktrees", async () => {
    await expect(
      withWorktreeLayoutEnv({ bare: false, worktrees: [] }, async () => undefined),
    ).rejects.toThrow();
  });

  it("strips a GIT_* variable for the callback and restores it afterward", async () => {
    const key = GIT_TEST_ENVIRONMENT_KEYS.DIR;
    const callerValues = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentValues([key]));
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    let observedInside: string | undefined = callerValues[key];
    let observedAfter: string | undefined;

    await withProcessEnv(callerValues, async () => {
      await withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, async () => {
        observedInside = process.env[key];
      });
      observedAfter = process.env[key];
    });

    expect(observedInside).toBeUndefined();
    expect(observedAfter).toBe(callerValues[key]);
  });

  it("keeps GIT_CEILING_DIRECTORIES at the caller's value during and after a returning callback", async () => {
    const key = GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES;
    const callerValues = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentValues([key]));
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    let observedInside: string | undefined;
    let observedAfter: string | undefined;

    await withProcessEnv(callerValues, async () => {
      await withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, async () => {
        observedInside = process.env[key];
      });
      observedAfter = process.env[key];
    });

    expect(observedInside).toBe(callerValues[key]);
    expect(observedAfter).toBe(callerValues[key]);
  });

  it("keeps GIT_CEILING_DIRECTORIES at the caller's value during and after a throwing callback", async () => {
    const key = GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES;
    const callerValues = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentValues([key]));
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const thrown = new Error(name);
    let observedInside: string | undefined;
    let observedAfter: string | undefined;

    await withProcessEnv(callerValues, async () => {
      await expect(
        withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, () => {
          observedInside = process.env[key];
          return Promise.reject(thrown);
        }),
      ).rejects.toBe(thrown);
      observedAfter = process.env[key];
    });

    expect(observedInside).toBe(callerValues[key]);
    expect(observedAfter).toBe(callerValues[key]);
  });

  it("restores a GIT_* variable after the callback throws", async () => {
    const key = GIT_TEST_ENVIRONMENT_KEYS.DIR;
    const callerValues = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.environmentValues([key]));
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const thrown = new Error(name);
    let observedAfter: string | undefined;

    await withProcessEnv(callerValues, async () => {
      await expect(
        withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, () => Promise.reject(thrown)),
      ).rejects.toBe(thrown);
      observedAfter = process.env[key];
    });

    expect(observedAfter).toBe(callerValues[key]);
  });
});
