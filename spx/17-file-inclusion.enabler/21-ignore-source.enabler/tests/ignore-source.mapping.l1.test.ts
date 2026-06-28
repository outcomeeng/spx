import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildIgnoreSourceGitLsFilesArgs,
  CORE_EXCLUDES_FILE_CONFIG_KEY,
  createIgnoreSourceReader,
  GIT_DEFAULT_GLOBAL_IGNORE_PATH,
  GIT_GLOBAL_EXCLUDES_ENV_KEYS,
  GIT_LS_FILES_ARGS,
} from "@/lib/file-inclusion/ignore-source";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import { fileContent, ignoredPattern, readerConfig } from "@testing/harnesses/file-inclusion/ignore-source";

const fakeHomePrefix = "spx-ignore-source-home-";
const fakeXdgConfigHomePrefix = "spx-ignore-source-xdg-";
const globalExcludesFileName = "global-excludes";

async function withProcessEnvironment(
  updates: Readonly<Record<string, string | undefined>>,
  callback: () => Promise<void>,
): Promise<void> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previousValues.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeDefaultGlobalIgnore(configHome: string, content: string): Promise<void> {
  const gitConfigDirectory = join(configHome, GIT_DEFAULT_GLOBAL_IGNORE_PATH.GIT_DIRECTORY);
  await mkdir(gitConfigDirectory, { recursive: true });
  await writeFile(join(gitConfigDirectory, GIT_DEFAULT_GLOBAL_IGNORE_PATH.IGNORE_FILE), content);
}

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

  it("maps unset core.excludesFile to the default XDG global excludes path", async () => {
    await withGitWorktreeEnv(async (env) => {
      await withTempDir(fakeXdgConfigHomePrefix, async (fakeXdgConfigHome) => {
        const excluded = ignoredPattern();
        await writeDefaultGlobalIgnore(fakeXdgConfigHome, `${excluded}\n`);
        await env.writeUntracked(excluded, fileContent());

        await withProcessEnvironment({
          [GIT_GLOBAL_EXCLUDES_ENV_KEYS.XDG_CONFIG_HOME]: fakeXdgConfigHome,
          [GIT_GLOBAL_EXCLUDES_ENV_KEYS.HOME]: undefined,
        }, async () => {
          const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));
          expect(reader.isInIncludedSet(excluded)).toBe(false);
        });
      });
    });
  });

  it("maps unset core.excludesFile to the default HOME global excludes path when XDG is absent", async () => {
    await withGitWorktreeEnv(async (env) => {
      await withTempDir(fakeHomePrefix, async (fakeHome) => {
        const excluded = ignoredPattern();
        const defaultConfigHome = join(fakeHome, GIT_DEFAULT_GLOBAL_IGNORE_PATH.CONFIG_DIRECTORY);
        await writeDefaultGlobalIgnore(defaultConfigHome, `${excluded}\n`);
        await env.writeUntracked(excluded, fileContent());

        await withProcessEnvironment({
          [GIT_GLOBAL_EXCLUDES_ENV_KEYS.XDG_CONFIG_HOME]: undefined,
          [GIT_GLOBAL_EXCLUDES_ENV_KEYS.HOME]: fakeHome,
        }, async () => {
          const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));
          expect(reader.isInIncludedSet(excluded)).toBe(false);
        });
      });
    });
  });

  it("maps --ignore-file to an additional exclude source", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      const ignoreFile = ignoredPattern();
      await env.writeUntracked(ignoreFile, `${ignored}\n`);
      await env.writeUntracked(ignored, fileContent());
      const config = readerConfig({ ignoreFile });

      const args = buildIgnoreSourceGitLsFilesArgs(env.productDir, config.overrides);
      const excludeFromIndex = args.indexOf(GIT_LS_FILES_ARGS.EXCLUDE_FROM);
      const reader = createIgnoreSourceReader(env.productDir, config);

      expect(args[excludeFromIndex + 1]).toBe(join(env.productDir, ignoreFile));
      expect(reader.isInIncludedSet(ignored)).toBe(false);
    });
  });

  it("maps a missing --ignore-file to git so git reports the invalid caller input", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignoreFile = ignoredPattern();
      const config = readerConfig({ ignoreFile });

      const args = buildIgnoreSourceGitLsFilesArgs(env.productDir, config.overrides);
      const excludeFromIndex = args.indexOf(GIT_LS_FILES_ARGS.EXCLUDE_FROM);

      expect(args[excludeFromIndex + 1]).toBe(join(env.productDir, ignoreFile));
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

        await withProcessEnvironment({
          [GIT_GLOBAL_EXCLUDES_ENV_KEYS.HOME]: fakeHome,
        }, async () => {
          const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));
          expect(reader.isInIncludedSet(excluded)).toBe(false);
        });
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
