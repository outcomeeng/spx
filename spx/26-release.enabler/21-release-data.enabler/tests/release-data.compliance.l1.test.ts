import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { defaultGitDependencies } from "@/lib/git/root";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { GIT_REMOTE_SUBCOMMANDS, observeProductionGitInvocations } from "@testing/harnesses/release/git-runner";

describe("computeReleaseData — git plumbing and the working tree are the only inputs", () => {
  it("invokes only git, and never a subcommand that reaches a remote", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, head] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.complianceCommits),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());
      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
      await env.writeTracked(head.path, head.content);
      await env.commit(head.subject);

      const observation = await observeProductionGitInvocations(() =>
        computeReleaseData({
          productDir: env.productDir,
          packageVersion,
        })
      );

      expect(observation.invocations.length).toBeGreaterThan(0);
      for (const invocation of observation.invocations) {
        expect(invocation.executable).toBe(GIT_TEST_COMMAND);
        expect(GIT_REMOTE_SUBCOMMANDS).not.toContain(invocation.args[0]);
      }
      expect(observation.value.commits.map((commit) => commit.subject)).toEqual([head.subject]);
    });
  });

  it("records a remote-reaching subcommand so the evidence above can fail", async () => {
    await withGitWorktreeEnv(async (env) => {
      const observation = await observeProductionGitInvocations(() =>
        defaultGitDependencies.execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.FETCH], {
          cwd: env.productDir,
          reject: false,
        })
      );

      expect(observation.invocations.map((invocation) => invocation.args[0])).toEqual([GIT_TEST_SUBCOMMANDS.FETCH]);
      expect(GIT_REMOTE_SUBCOMMANDS).toContain(GIT_TEST_SUBCOMMANDS.FETCH);
    });
  });
});
