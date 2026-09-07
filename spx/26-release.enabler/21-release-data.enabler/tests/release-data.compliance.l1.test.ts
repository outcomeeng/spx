import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { RecordingReleaseGitRunner } from "@testing/harnesses/release/git-runner";

describe("computeReleaseData — git plumbing and the working tree are the only inputs", () => {
  it("invokes only the git executable through the injected runner", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, head] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.complianceCommits),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());
      const runner = new RecordingReleaseGitRunner();

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
      await env.writeTracked(head.path, head.content);
      await env.commit(head.subject);

      const data = await computeReleaseData({
        productDir: env.productDir,
        packageVersion,
        deps: runner,
      });

      expect(runner.invokedExecutables.length).toBeGreaterThan(0);
      expect(runner.invokedExecutables.every((executable) => executable === GIT_TEST_COMMAND)).toBe(true);
      expect(data.commits.map((commit) => commit.subject)).toEqual([head.subject]);
    });
  });
});
