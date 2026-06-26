import { describe, expect, it } from "vitest";

import { scopeResolverFixture, writeScopeResolverFixture } from "@testing/harnesses/file-inclusion/scope-resolver";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("scope-resolver test harness — scenarios", () => {
  it("writeScopeResolverFixture materializes every curated exemplar path under the env", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const tracked = await env.runGit([
        GIT_TEST_SUBCOMMANDS.LS_FILES,
        GIT_TEST_FLAGS.CACHED,
        GIT_TEST_FLAGS.FULL_NAME,
      ]);
      expect(tracked).toContain(fixture.trackedFilePath);
      expect(tracked).toContain(fixture.domainExcludedPath);
      expect(tracked).toContain(fixture.domainIncludedPath);
    });
  });
});
