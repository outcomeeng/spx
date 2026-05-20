import { describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import {
  type GitWorktreeEnv,
  INFO_EXCLUDE_RELATIVE_PATH,
  withGitWorktreeEnv,
} from "@testing/harnesses/git-worktree/git-worktree";

type IgnoreSourceCase = {
  readonly source: string;
  readonly buildIgnoredPath: (pattern: string, nestedDirectory: string) => string;
  readonly configureIgnoreSource: (
    env: GitWorktreeEnv,
    pattern: string,
    nestedDirectory: string,
  ) => Promise<void>;
};

describe("withGitWorktreeEnv — ignore sources", () => {
  const cases: readonly IgnoreSourceCase[] = [
    {
      source: "top-level .gitignore",
      buildIgnoredPath: (pattern) => pattern,
      configureIgnoreSource: (env, pattern) => env.writeGitignore(".", `${pattern}\n`),
    },
    {
      source: "nested .gitignore",
      buildIgnoredPath: (pattern, nestedDirectory) => `${nestedDirectory}/${pattern}`,
      configureIgnoreSource: (env, pattern, nestedDirectory) => env.writeGitignore(nestedDirectory, `${pattern}\n`),
    },
    {
      source: INFO_EXCLUDE_RELATIVE_PATH,
      buildIgnoredPath: (pattern) => pattern,
      configureIgnoreSource: (env, pattern) => env.writeInfoExclude(`${pattern}\n`),
    },
    {
      source: "global excludes via core.excludesFile",
      buildIgnoredPath: (pattern) => pattern,
      configureIgnoreSource: (env, pattern) => env.configureGlobalExcludes(`${pattern}\n`),
    },
  ];

  it.each(cases)(
    "$source pattern excludes the matching path from ls-files",
    async ({ buildIgnoredPath, configureIgnoreSource }) => {
      await withGitWorktreeEnv(async (env) => {
        const pattern = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern());
        const nestedDirectory = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.nestedDirectory());
        const ignoredPath = buildIgnoredPath(pattern, nestedDirectory);
        const content = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent());

        await configureIgnoreSource(env, pattern, nestedDirectory);
        await env.writeUntracked(ignoredPath, content);

        const visible = await env.runGit([
          GIT_TEST_SUBCOMMANDS.LS_FILES,
          GIT_TEST_FLAGS.CACHED,
          GIT_TEST_FLAGS.OTHERS,
          GIT_TEST_FLAGS.EXCLUDE_STANDARD,
          GIT_TEST_FLAGS.FULL_NAME,
        ]);

        expect(visible.split("\n").filter(Boolean)).not.toContain(ignoredPath);
      });
    },
  );
});
