import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_EXCLUDES_FILE_CONFIG_KEY, createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { fileContent, ignoredPattern, readerConfig } from "@testing/harnesses/file-inclusion/ignore-source";

const fakeHomePrefix = "spx-ignore-source-home-";
const globalExcludesFileName = "global-excludes";
const homeEnvironmentKey = "HOME";

describe("ignore-source — mappings", () => {
  it("maps --no-ignore-vcs to bypass .gitignore while still honoring info/exclude and global excludes", async () => {
    await withGitWorktreeEnv(async (env) => {
      const gitignoreOnly = ignoredPattern();
      const infoExcluded = ignoredPattern();
      const globalExcluded = ignoredPattern();
      await env.writeGitignore(".", gitignoreOnly);
      await env.writeInfoExclude(`${infoExcluded}\n`);
      await env.configureGlobalExcludes(`${globalExcluded}\n`);
      await env.writeUntracked(gitignoreOnly, fileContent());
      await env.writeUntracked(infoExcluded, fileContent());
      await env.writeUntracked(globalExcluded, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));

      expect(reader.isInIncludedSet(gitignoreOnly)).toBe(true);
      expect(reader.isInIncludedSet(infoExcluded)).toBe(false);
      expect(reader.isInIncludedSet(globalExcluded)).toBe(false);
    });
  });

  it("maps relative core.excludesFile paths from the product directory", async () => {
    await withGitWorktreeEnv(async (env) => {
      const excluded = ignoredPattern();
      const relativeExcludesFile = ignoredPattern();
      await env.writeUntracked(relativeExcludesFile, `${excluded}\n`);
      await env.runGit([GIT_TEST_SUBCOMMANDS.CONFIG, CORE_EXCLUDES_FILE_CONFIG_KEY, relativeExcludesFile]);
      await env.writeUntracked(excluded, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));

      expect(reader.isInIncludedSet(excluded)).toBe(false);
    });
  });

  it("maps tilde-prefixed core.excludesFile paths through git path semantics", async () => {
    await withGitWorktreeEnv(async (env) => {
      await withTempDir(fakeHomePrefix, async (fakeHome) => {
        const excluded = ignoredPattern();
        await writeFile(join(fakeHome, globalExcludesFileName), `${excluded}\n`);
        await env.runGit([
          GIT_TEST_SUBCOMMANDS.CONFIG,
          CORE_EXCLUDES_FILE_CONFIG_KEY,
          `~/${globalExcludesFileName}`,
        ]);
        await env.writeUntracked(excluded, fileContent());

        const previousHome = process.env[homeEnvironmentKey];
        process.env[homeEnvironmentKey] = fakeHome;
        try {
          const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));
          expect(reader.isInIncludedSet(excluded)).toBe(false);
        } finally {
          if (previousHome === undefined) {
            delete process.env[homeEnvironmentKey];
          } else {
            process.env[homeEnvironmentKey] = previousHome;
          }
        }
      });
    });
  });

  it("lets --no-ignore take precedence over --no-ignore-vcs", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      await env.writeGitignore(".", ignored);
      await env.writeInfoExclude(`${ignored}\n`);
      await env.configureGlobalExcludes(`${ignored}\n`);
      await env.writeUntracked(ignored, fileContent());

      const reader = createIgnoreSourceReader(
        env.productDir,
        readerConfig({
          noIgnore: true,
          noIgnoreVcs: true,
        }),
      );

      expect(reader.isInIncludedSet(ignored)).toBe(true);
    });
  });

  it("reports the structured overrides applied during construction", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignoreFile = ignoredPattern();
      await env.writeUntracked(ignoreFile, `${ignoredPattern()}\n`);

      const reader = createIgnoreSourceReader(
        env.productDir,
        readerConfig({
          noIgnore: true,
          ignoreFile,
        }),
      );

      expect(reader.appliedOverrides()).toEqual({
        noIgnore: true,
        noIgnoreVcs: false,
        ignoreFile,
      });
    });
  });
});
