import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_TEST_ENVIRONMENT_KEYS } from "@testing/harnesses/git-test-constants";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("worktree layout test harness", () => {
  it("resolves a provisioned worktree by name and throws for an unprovisioned name", async () => {
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const missing = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, async (env) => {
      expect(env.worktree(name)).toBe(env.worktrees[name]);
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
    const sentinel = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const name = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const prior = process.env[key];
    process.env[key] = sentinel;

    try {
      await withWorktreeLayoutEnv({ bare: false, worktrees: [{ name }] }, async () => {
        expect(process.env[key]).toBeUndefined();
      });
      expect(process.env[key]).toBe(sentinel);
    } finally {
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  });
});
