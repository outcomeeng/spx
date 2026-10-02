import { describe, expect, it } from "vitest";

import {
  buildIgnoreSourceGitLsFilesArgs,
  createIgnoreSourceReader,
  GIT_LS_FILES_ARGS,
} from "@/lib/file-inclusion/ignore-source";
import {
  GLOBAL_EXCLUDES_CONFIGURATION_FORM,
  globalExcludesConfigurationForms,
  ignoreSourceOverrideDomain,
} from "@testing/generators/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

import {
  ignoreSourceOverridesFor,
  readerConfig,
  withNonVcsExcludeSources,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source — mappings", () => {
  it.each(ignoreSourceOverrideDomain())(
    "maps noIgnore=$noIgnore, noIgnoreVcs=$noIgnoreVcs, ignoreFile present=$ignoreFilePresent to git ls-files arguments",
    async (overrideCase) => {
      await withGitWorktreeEnv(async (env) => {
        await withNonVcsExcludeSources(env, GLOBAL_EXCLUDES_CONFIGURATION_FORM.ABSOLUTE, async (sources) => {
          const overrides = await ignoreSourceOverridesFor(env, overrideCase);

          const args = buildIgnoreSourceGitLsFilesArgs(env.productDir, overrides);
          const excludeFromOperands = args.flatMap((arg, index) =>
            arg === GIT_LS_FILES_ARGS.EXCLUDE_FROM ? [args[index + 1]] : []
          );

          expect(args).toEqual(expect.arrayContaining([
            GIT_LS_FILES_ARGS.LS_FILES,
            GIT_LS_FILES_ARGS.CACHED,
            GIT_LS_FILES_ARGS.OTHERS,
            GIT_LS_FILES_ARGS.FULL_NAME,
            GIT_LS_FILES_ARGS.NULL_TERMINATED,
          ]));
          expect(args.includes(GIT_LS_FILES_ARGS.EXCLUDE_STANDARD)).toBe(!overrides.noIgnore && !overrides.noIgnoreVcs);
          const expectedExcludeFromOperands = [
            ...(overrides.ignoreFile === undefined ? [] : [overrides.ignoreFile]),
            ...(overrides.noIgnoreVcs && !overrides.noIgnore
              ? [sources.infoExcludeFile, sources.globalExcludesFile]
              : []),
          ];
          expect(excludeFromOperands).toHaveLength(expectedExcludeFromOperands.length);
          expect(excludeFromOperands).toEqual(expect.arrayContaining(expectedExcludeFromOperands));
          expect(createIgnoreSourceReader(env.productDir, { overrides }).appliedOverrides()).toEqual(overrides);
        });
      });
    },
  );

  it.each(globalExcludesConfigurationForms())(
    "maps a %s global gitignore location under --no-ignore-vcs to git's own non-VCS exclusion decisions",
    async (form) => {
      await withGitWorktreeEnv(async (env) => {
        await withNonVcsExcludeSources(env, form, async (sources) => {
          const standard = createIgnoreSourceReader(env.productDir, readerConfig());
          const noIgnoreVcs = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));

          expect(standard.isInIncludedSet(sources.gitignoredPath)).toBe(false);
          expect(noIgnoreVcs.isInIncludedSet(sources.gitignoredPath)).toBe(true);
          expect(noIgnoreVcs.isInIncludedSet(sources.infoExcludedPath)).toBe(
            standard.isInIncludedSet(sources.infoExcludedPath),
          );
          expect(noIgnoreVcs.isInIncludedSet(sources.globalExcludedPath)).toBe(
            standard.isInIncludedSet(sources.globalExcludedPath),
          );
        });
      });
    },
  );
});
