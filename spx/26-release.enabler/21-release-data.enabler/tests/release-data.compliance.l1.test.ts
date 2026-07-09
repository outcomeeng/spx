import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { computeReleaseData } from "@/domains/release/release-data";
import { withoutGitEnvironment } from "@/lib/git/environment";
import { type ExecResult, type GitDependencies } from "@/lib/git/root";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

/**
 * Records the executable of every command release-data computation runs while
 * delegating to real git, so the test can prove git is the only program invoked.
 */
class RecordingGitRunner implements GitDependencies {
  readonly invokedExecutables: string[] = [];

  async execa(
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ): Promise<ExecResult> {
    this.invokedExecutables.push(command);
    const result = await execa(command, [...args], {
      cwd: options?.cwd,
      reject: options?.reject,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    return {
      exitCode: result.exitCode ?? 0,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    };
  }
}

describe("computeReleaseData — git plumbing and the working tree are the only inputs", () => {
  it("invokes only the git executable through the injected runner", async () => {
    await withGitWorktreeEnv(async (env) => {
      const [base, head] = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.commitSequence(RELEASE_TEST_GENERATOR.counts.complianceCommits),
      );
      const tag = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseTag());
      const packageVersion = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.semver());
      const runner = new RecordingGitRunner();

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
