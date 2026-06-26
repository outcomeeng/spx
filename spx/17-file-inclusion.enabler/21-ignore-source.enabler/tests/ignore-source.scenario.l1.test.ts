import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader, GIT_MISSING_CONTEXT_MESSAGE } from "@/lib/file-inclusion/ignore-source";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

import {
  bogusGitDir,
  fileContent,
  ignoredPattern,
  readerConfig,
  submodulePath,
  trackedFilePath,
  untrackedFilePath,
} from "@testing/harnesses/file-inclusion/ignore-source";

const linkedWorktreeTempPrefix = "spx-linked-ignore-source-";

async function writeUnderDirectory(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

describe("ignore-source — scenarios", () => {
  it("reports tracked and untracked-not-ignored paths as included and gitignored paths as excluded", async () => {
    await withGitWorktreeEnv(async (env) => {
      const tracked = trackedFilePath();
      const untracked = untrackedFilePath();
      const ignored = ignoredPattern();
      await env.writeTracked(tracked, fileContent());
      await env.writeUntracked(untracked, fileContent());
      await env.writeGitignore(".", ignored);
      await env.writeUntracked(ignored, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.isInIncludedSet(tracked)).toBe(true);
      expect(reader.isInIncludedSet(untracked)).toBe(true);
      expect(reader.isInIncludedSet(ignored)).toBe(false);
    });
  });

  it("preserves path spelling for filenames ending with a space", async () => {
    await withGitWorktreeEnv(async (env) => {
      const spacedPath = `${trackedFilePath()} `;
      await env.writeTracked(spacedPath, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.isInIncludedSet(spacedPath)).toBe(true);
    });
  });

  it("reports paths ignored by nested, info, and global git ignore sources as excluded", async () => {
    await withGitWorktreeEnv(async (env) => {
      const nestedDirectory = submodulePath();
      const nestedPattern = ignoredPattern();
      const nestedIgnored = `${nestedDirectory}/${nestedPattern}`;
      const infoIgnored = ignoredPattern();
      const globalIgnored = ignoredPattern();
      await env.writeGitignore(nestedDirectory, nestedPattern);
      await env.writeUntracked(nestedIgnored, fileContent());
      await env.writeInfoExclude(`${infoIgnored}\n`);
      await env.writeUntracked(infoIgnored, fileContent());
      await env.configureGlobalExcludes(`${globalIgnored}\n`);
      await env.writeUntracked(globalIgnored, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.isInIncludedSet(nestedIgnored)).toBe(false);
      expect(reader.isInIncludedSet(infoIgnored)).toBe(false);
      expect(reader.isInIncludedSet(globalIgnored)).toBe(false);
    });
  });

  it("honors --no-ignore by including paths every git ignore source would otherwise exclude", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      await env.writeGitignore(".", ignored);
      await env.writeUntracked(ignored, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnore: true }));

      expect(reader.isInIncludedSet(ignored)).toBe(true);
    });
  });

  it("honors --ignore-file by excluding paths matching the supplied ignore file", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      const ignoreFile = ignoredPattern();
      await env.writeUntracked(ignored, fileContent());
      await env.writeUntracked(ignoreFile, `${ignored}\n`);

      const reader = createIgnoreSourceReader(
        env.productDir,
        readerConfig({
          ignoreFile: join(env.productDir, ignoreFile),
        }),
      );

      expect(reader.isInIncludedSet(ignored)).toBe(false);
    });
  });

  it("excludes submodule contents from the included set", async () => {
    await withGitWorktreeEnv(async (env) => {
      const submodule = submodulePath();
      const submoduleContent = trackedFilePath();
      await env.addSubmodule(submodule);

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.isInIncludedSet(`${submodule}/${submoduleContent}`)).toBe(false);
    });
  });

  it("honors --no-ignore-vcs repo-local excludes from a linked worktree", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      await env.writeInfoExclude(`${ignored}\n`);
      await env.writeTracked(trackedFilePath(), fileContent());
      await env.commit(sampleGitWorktreeTestValue(arbitraryPathSegment()));
      await withTempDir(linkedWorktreeTempPrefix, async (linkedWorktreeDir) => {
        await env.runGit([
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          sampleGitWorktreeTestValue(arbitraryPathSegment()),
          linkedWorktreeDir,
        ]);
        await writeUnderDirectory(linkedWorktreeDir, ignored, fileContent());

        const reader = createIgnoreSourceReader(linkedWorktreeDir, readerConfig({ noIgnoreVcs: true }));

        expect(reader.isInIncludedSet(ignored)).toBe(false);
      });
    });
  });

  it("fails with an actionable error outside a git working tree", () => {
    const productDir = bogusGitDir();

    expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(productDir);
    expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(GIT_MISSING_CONTEXT_MESSAGE);
  });
});
