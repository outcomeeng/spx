import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("computeReleaseData — release contents derive from git history", () => {
  it("lists the commits between the most recent release tag preceding the release and HEAD", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, ...rest] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.commitsAfterTag + 1),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
      for (const commit of rest) {
        await env.writeTracked(commit.path, commit.content);
        await env.commit(commit.subject);
      }

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      const subjects = data.commits.map((commit) => commit.subject);
      expect(data.previousTag).toBe(tag);
      expect(subjects).toEqual(expect.arrayContaining(rest.map((commit) => commit.subject)));
      expect(subjects).not.toContain(base.subject);
      expect(data.commits).toHaveLength(rest.length);
      expect(data.changedPaths).toEqual(expect.arrayContaining(rest.map((commit) => commit.path)));
      expect(data.changedPaths).not.toContain(base.path);
    });
  });

  it("anchors on the prior release tag when the release commit is itself tagged, so the release is not empty", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, head] = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.commitSequence(2));
      const { earlier, later } = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTagPair());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, earlier]);
      await env.writeTracked(head.path, head.content);
      await env.commit(head.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, later]);

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      expect(data.previousTag).toBe(earlier);
      expect(data.commits.map((commit) => commit.subject)).toEqual([head.subject]);
      expect(data.changedPaths).toContain(head.path);
      expect(data.changedPaths).not.toContain(base.path);
    });
  });

  it("anchors on the prior release tag when the release commit carries multiple release tags", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, head] = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.commitSequence(2));
      const [prior, headTagA, headTagB] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.distinctReleaseTags(3),
      );
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, prior]);
      await env.writeTracked(head.path, head.content);
      await env.commit(head.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, headTagA]);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, headTagB]);

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      expect(data.previousTag).toBe(prior);
      expect(data.commits.map((commit) => commit.subject)).toEqual([head.subject]);
    });
  });

  it("reports the full commit history when no previous release tag exists", async () => {
    await withGitWorktreeEnv(async (env) => {
      const commits = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.fullHistoryCommits),
      );
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      for (const commit of commits) {
        await env.writeTracked(commit.path, commit.content);
        await env.commit(commit.subject);
      }

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      expect(data.previousTag).toBeNull();
      expect(data.commits.map((commit) => commit.subject)).toEqual(
        expect.arrayContaining(commits.map((commit) => commit.subject)),
      );
      expect(data.commits).toHaveLength(commits.length);
      expect(data.changedPaths).toEqual(expect.arrayContaining(commits.map((commit) => commit.path)));
    });
  });
});
