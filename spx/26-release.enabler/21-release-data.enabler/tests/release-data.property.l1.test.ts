import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("computeReleaseData — release data is a deterministic function of repository state", () => {
  it("produces identical release data for identical repository state", async () => {
    await assertProperty(
      RELEASE_TEST_GENERATOR.releaseDataDeterminismScenario(),
      async ({ commits, tag, packageVersion, versionDelta }) => {
        await withGitWorktreeEnv(async (env) => {
          const [base, ...rest] = commits;
          const releaseCommits: Array<{ readonly sha: string; readonly subject: string; readonly path: string }> = [];
          await env.writeTracked(base.path, base.content);
          await env.commit(base.subject);
          await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, tag]);
          for (const commit of rest) {
            await env.writeTracked(commit.path, commit.content);
            await env.commit(commit.subject);
            releaseCommits.push({
              sha: await env.runGit([GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]),
              subject: commit.subject,
              path: commit.path,
            });
          }

          const expectedCommits = [...releaseCommits].reverse();
          const expectedReleaseData = {
            version: packageVersion,
            previousTag: tag,
            versionDelta,
            commits: expectedCommits.map(({ sha, subject }) => ({ sha, subject })),
            changedPaths: expectedCommits.map(({ path }) => path),
          };
          const first = await computeReleaseData({ productDir: env.productDir, packageVersion });
          const second = await computeReleaseData({ productDir: env.productDir, packageVersion });

          expect(first).toEqual(expectedReleaseData);
          expect(second).toEqual(expectedReleaseData);
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
