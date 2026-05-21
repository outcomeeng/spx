import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_OUTPUT,
  GIT_TEST_SUBCOMMANDS,
  readGit,
} from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("withGitWorktreeEnv — safety and GIT_* isolation", () => {
  it("ALWAYS: productDir is rooted under os.tmpdir()", async () => {
    await withGitWorktreeEnv(async (env) => {
      expect(env.productDir.startsWith(tmpdir())).toBe(true);
    });
  });

  describe("strip-and-restore covers every GIT_* variable the caller sets", () => {
    const gitEnvKeys: readonly string[] = Object.values(GIT_TEST_ENVIRONMENT_KEYS);
    const priorValues = new Map<string, string | undefined>();
    const sentinelValues = new Map<string, string>();

    beforeEach(() => {
      priorValues.clear();
      sentinelValues.clear();
      for (const key of gitEnvKeys) {
        priorValues.set(key, process.env[key]);
        const sentinel = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.bogusGitDir());
        sentinelValues.set(key, sentinel);
        process.env[key] = sentinel;
      }
    });

    afterEach(() => {
      for (const key of gitEnvKeys) {
        const prior = priorValues.get(key);
        if (prior === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = prior;
        }
      }
    });

    it("strips every set GIT_* variable inside the callback", async () => {
      await withGitWorktreeEnv(async () => {
        for (const key of gitEnvKeys) {
          expect(process.env[key]).toBeUndefined();
        }
      });
    });

    it("restores every set GIT_* variable to its sentinel value after the callback returns", async () => {
      await withGitWorktreeEnv(async () => {
        // body intentionally empty: observing post-callback restoration
      });

      for (const key of gitEnvKeys) {
        expect(process.env[key]).toBe(sentinelValues.get(key));
      }
    });

    it("restores every set GIT_* variable to its sentinel value after the callback throws", async () => {
      const thrownError = new Error("intentional safety-compliance throw");

      await expect(
        withGitWorktreeEnv(async () => {
          for (const key of gitEnvKeys) {
            expect(process.env[key]).toBeUndefined();
          }
          throw thrownError;
        }),
      ).rejects.toBe(thrownError);

      for (const key of gitEnvKeys) {
        expect(process.env[key]).toBe(sentinelValues.get(key));
      }
    });

    it("stripped GIT_DIR routes harness git invocations to productDir even when the caller set a bogus value", async () => {
      await withGitWorktreeEnv(async (env) => {
        const insideWorktree = await readGit(env.productDir, [
          GIT_TEST_SUBCOMMANDS.REV_PARSE,
          GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE,
        ]);
        expect(insideWorktree).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
      });
    });
  });
});
