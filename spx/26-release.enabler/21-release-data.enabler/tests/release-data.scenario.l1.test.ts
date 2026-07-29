import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("computeReleaseData — release contents derive from git history", () => {
  it("carries the package version it was computed with, so downstream children read one version", async () => {
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

      expect(data.version).toBe(packageVersion);
    });
  });

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

  it("ends release contents at an explicit tagged release ref", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, release, later] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.releaseNotesCommits),
      );
      const { earlier, later: releaseTag } = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.releaseTagPair(),
      );
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, earlier]);
      await env.writeTracked(release.path, release.content);
      await env.commit(release.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, releaseTag]);
      await env.writeTracked(later.path, later.content);
      await env.commit(later.subject);

      const data = await computeReleaseData({
        productDir: env.productDir,
        packageVersion,
        releaseRef: releaseTag,
      });

      expect(data.previousTag).toBe(earlier);
      expect(data.commits.map((commit) => commit.subject)).toEqual([release.subject]);
      expect(data.changedPaths).toEqual([release.path]);
    });
  });

  it("reports the full commit history as the release contents when no previous release tag exists", async () => {
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
      expect(data.changedPaths).toHaveLength(commits.length);
    });
  });

  it("lists exactly the paths the commits since the previous release tag touch", async () => {
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

      expect(data.changedPaths).toEqual(expect.arrayContaining(rest.map((commit) => commit.path)));
      expect(data.changedPaths).not.toContain(base.path);
      expect(data.changedPaths).toHaveLength(rest.length);
    });
  });

  it("includes a path introduced by a merge commit beyond either parent", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, branch, mergeOnly] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.releaseNotesCommits),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());
      const branchName = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.branchName());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
      const baseBranch = await env.runGit([GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT]);
      await env.runGit([GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.NEW_BRANCH, branchName]);
      await env.writeTracked(branch.path, branch.content);
      await env.commit(branch.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.CHECKOUT, baseBranch]);
      await env.runGit([
        GIT_TEST_SUBCOMMANDS.MERGE,
        GIT_TEST_FLAGS.NO_FAST_FORWARD,
        GIT_TEST_FLAGS.NO_COMMIT,
        branchName,
      ]);
      await env.writeTracked(mergeOnly.path, mergeOnly.content);
      await env.commit(mergeOnly.subject);

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      expect(data.changedPaths).toContain(mergeOnly.path);
    });
  });

  it("reports a path changed by more than one commit since the tag only once", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, second, third] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.commitsAfterTag + 1),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());

      await env.writeTracked(base.path, base.content);
      await env.commit(base.subject);
      await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
      await env.writeTracked(base.path, second.content);
      await env.commit(second.subject);
      await env.writeTracked(base.path, third.content);
      await env.commit(third.subject);

      const data = await computeReleaseData({ productDir: env.productDir, packageVersion });

      expect(data.changedPaths).toEqual([base.path]);
    });
  });
});
