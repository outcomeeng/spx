import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildIgnoreSourceGitLsFilesArgs,
  createIgnoreSourceReader,
  GIT_MISSING_CONTEXT_MESSAGE,
} from "@/lib/file-inclusion/ignore-source";
import { GLOBAL_EXCLUDES_CONFIGURATION_FORM } from "@testing/generators/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

import {
  bogusGitDir,
  fileContent,
  ignoredPattern,
  readerConfig,
  submodulePath,
  trackedFilePath,
  untrackedFilePath,
  withLinkedWorktree,
  withNonGitDirectory,
  withNonVcsExcludeSources,
  writeScopeLargerThanDefaultBuffer,
} from "@testing/harnesses/file-inclusion/ignore-source";

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

  it("reads git scope output larger than Node's default sync buffer", async () => {
    await withGitWorktreeEnv(async (env) => {
      const samplePath = await writeScopeLargerThanDefaultBuffer(env.productDir);

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.isInIncludedSet(samplePath)).toBe(true);
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
      const topLevelIgnored = ignoredPattern();
      const nestedDirectory = submodulePath();
      const nestedPattern = ignoredPattern();
      const nestedIgnored = `${nestedDirectory}/${nestedPattern}`;
      const infoIgnored = ignoredPattern();
      const globalIgnored = ignoredPattern();
      await env.writeGitignore(".", topLevelIgnored);
      await env.writeUntracked(topLevelIgnored, fileContent());
      await env.writeGitignore(nestedDirectory, nestedPattern);
      await env.writeUntracked(nestedIgnored, fileContent());
      await env.writeInfoExclude(`${infoIgnored}\n`);
      await env.writeUntracked(infoIgnored, fileContent());
      await env.configureGlobalExcludes(`${globalIgnored}\n`);
      await env.writeUntracked(globalIgnored, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnore: true }));

      expect(reader.isInIncludedSet(topLevelIgnored)).toBe(true);
      expect(reader.isInIncludedSet(nestedIgnored)).toBe(true);
      expect(reader.isInIncludedSet(infoIgnored)).toBe(true);
      expect(reader.isInIncludedSet(globalIgnored)).toBe(true);
    });
  });

  it("honors --no-ignore-vcs by including .gitignore-only paths and excluding info and global excludes", async () => {
    await withGitWorktreeEnv(async (env) => {
      const gitignoreOnly = ignoredPattern();
      const nestedDirectory = submodulePath();
      const nestedPattern = ignoredPattern();
      const nestedGitignoreOnly = `${nestedDirectory}/${nestedPattern}`;
      const infoExcluded = ignoredPattern();
      const globalExcluded = ignoredPattern();
      await env.writeGitignore(".", gitignoreOnly);
      await env.writeUntracked(gitignoreOnly, fileContent());
      await env.writeGitignore(nestedDirectory, nestedPattern);
      await env.writeUntracked(nestedGitignoreOnly, fileContent());
      await env.writeInfoExclude(`${infoExcluded}\n`);
      await env.writeUntracked(infoExcluded, fileContent());
      await env.configureGlobalExcludes(`${globalExcluded}\n`);
      await env.writeUntracked(globalExcluded, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));

      expect(reader.isInIncludedSet(gitignoreOnly)).toBe(true);
      expect(reader.isInIncludedSet(nestedGitignoreOnly)).toBe(true);
      expect(reader.isInIncludedSet(infoExcluded)).toBe(false);
      expect(reader.isInIncludedSet(globalExcluded)).toBe(false);
    });
  });

  it("honors --no-ignore-vcs repo-local excludes from a linked worktree", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      await env.writeInfoExclude(`${ignored}\n`);
      await withLinkedWorktree(env, async (linked) => {
        await linked.writeUntracked(ignored, fileContent());

        const reader = createIgnoreSourceReader(linked.productDir, readerConfig({ noIgnoreVcs: true }));

        expect(reader.isInIncludedSet(ignored)).toBe(false);
      });
    });
  });

  it("resolves a tilde core.excludesFile through git path semantics before supplying it under --no-ignore-vcs", async () => {
    await withGitWorktreeEnv(async (env) => {
      await withNonVcsExcludeSources(env, GLOBAL_EXCLUDES_CONFIGURATION_FORM.TILDE, async (sources) => {
        const args = buildIgnoreSourceGitLsFilesArgs(env.productDir, { noIgnoreVcs: true });
        const reader = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));

        expect(args).toContain(sources.globalExcludesFile);
        expect(reader.isInIncludedSet(sources.globalExcludedPath)).toBe(false);
      });
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

  it("honors product-relative --ignore-file paths", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      const ignoreFile = ignoredPattern();
      await env.writeUntracked(ignored, fileContent());
      await env.writeUntracked(ignoreFile, `${ignored}\n`);

      const reader = createIgnoreSourceReader(env.productDir, readerConfig({ ignoreFile }));

      expect(reader.isInIncludedSet(ignored)).toBe(false);
    });
  });

  it("lets --no-ignore take precedence over --ignore-file", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      const ignoreFile = ignoredPattern();
      await env.writeUntracked(ignored, fileContent());
      await env.writeUntracked(ignoreFile, `${ignored}\n`);

      const reader = createIgnoreSourceReader(
        env.productDir,
        readerConfig({
          noIgnore: true,
          ignoreFile,
        }),
      );

      expect(reader.isInIncludedSet(ignored)).toBe(true);
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

  it("fails with an actionable error for an existing directory outside a git working tree", async () => {
    await withNonGitDirectory(async (productDir) => {
      expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(productDir);
      expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(GIT_MISSING_CONTEXT_MESSAGE);
    });
  });

  it("fails with an actionable error for a directory path that does not exist", () => {
    const productDir = bogusGitDir();

    expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(productDir);
    expect(() => createIgnoreSourceReader(productDir, readerConfig())).toThrow(GIT_MISSING_CONTEXT_MESSAGE);
  });
});
