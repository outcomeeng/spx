import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { GIT_CEILING_DIRECTORIES_KEY } from "@/lib/git/environment";
import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import {
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_OUTPUT,
  GIT_TEST_STRIPPED_ENVIRONMENT_KEYS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
} from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withProcessEnv } from "@testing/harnesses/process-env/process-env";

describe("withGitWorktreeEnv — safety and GIT_* isolation", () => {
  it("ALWAYS: productDir is rooted under os.tmpdir()", async () => {
    await withGitWorktreeEnv(async (env) => {
      expect(env.productDir.startsWith(tmpdir())).toBe(true);
    });
  });

  describe("strip-and-restore covers every GIT_* variable and keeps GIT_CEILING_DIRECTORIES at the caller's value", () => {
    it("strips every set GIT_* variable except the ceiling inside the callback and keeps the ceiling", async () => {
      const callerValues = sampleGitWorktreeTestValue(
        GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
      );
      const observedInside: Record<string, string | undefined> = {};

      await withProcessEnv(callerValues, async () => {
        await withGitWorktreeEnv(async () => {
          for (const key of Object.keys(callerValues)) {
            observedInside[key] = process.env[key];
          }
        });
      });

      for (const key of GIT_TEST_STRIPPED_ENVIRONMENT_KEYS) {
        expect(observedInside[key]).toBeUndefined();
      }
      expect(observedInside[GIT_CEILING_DIRECTORIES_KEY]).toBe(callerValues[GIT_CEILING_DIRECTORIES_KEY]);
    });

    it("restores every set GIT_* variable to its caller value after the callback returns", async () => {
      const callerValues = sampleGitWorktreeTestValue(
        GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
      );
      const observedAfter: Record<string, string | undefined> = {};

      await withProcessEnv(callerValues, async () => {
        await withGitWorktreeEnv(async () => {
          // body intentionally empty: observing post-callback restoration
        });
        for (const key of Object.keys(callerValues)) {
          observedAfter[key] = process.env[key];
        }
      });

      expect(observedAfter).toEqual(callerValues);
    });

    it("restores every set GIT_* variable to its caller value after the callback throws", async () => {
      const callerValues = sampleGitWorktreeTestValue(
        GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
      );
      const thrownError = new Error("intentional safety-compliance throw");
      const observedAfter: Record<string, string | undefined> = {};

      await withProcessEnv(callerValues, async () => {
        await expect(
          withGitWorktreeEnv(async () => {
            throw thrownError;
          }),
        ).rejects.toBe(thrownError);
        for (const key of Object.keys(callerValues)) {
          observedAfter[key] = process.env[key];
        }
      });

      expect(observedAfter).toEqual(callerValues);
    });

    it("stripped GIT_DIR routes harness git invocations to productDir even when the caller set a bogus value", async () => {
      const callerValues = sampleGitWorktreeTestValue(
        GIT_WORKTREE_TEST_GENERATOR.environmentValues(Object.values(GIT_TEST_ENVIRONMENT_KEYS)),
      );
      let insideWorktree = "";

      await withProcessEnv(callerValues, async () => {
        await withGitWorktreeEnv(async (env) => {
          insideWorktree = await readGit(env.productDir, [
            GIT_TEST_SUBCOMMANDS.REV_PARSE,
            GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE,
          ]);
        });
      });

      expect(insideWorktree).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
    });
  });
});
