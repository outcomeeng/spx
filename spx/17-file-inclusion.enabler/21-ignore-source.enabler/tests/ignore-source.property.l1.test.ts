import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { IGNORE_SOURCE_TEST_GENERATOR } from "@testing/generators/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

import {
  materializeIgnoreSourceWorktree,
  mutateIgnoreSourceWorktree,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source — properties", () => {
  it("readers constructed from the same worktree state and override flags report equal membership", async () => {
    await assertProperty(
      IGNORE_SOURCE_TEST_GENERATOR.worktreeState(),
      async (state) => {
        await withGitWorktreeEnv(async (env) => {
          const worktree = await materializeIgnoreSourceWorktree(env, state);

          const first = createIgnoreSourceReader(env.productDir, worktree.readerConfig);
          const second = createIgnoreSourceReader(env.productDir, worktree.readerConfig);

          expect(worktree.queryPaths.map((path) => second.isInIncludedSet(path))).toEqual(
            worktree.queryPaths.map((path) => first.isInIncludedSet(path)),
          );
          expect(worktree.queryDirectories.map((directory) => second.hasIncludedDescendant(directory))).toEqual(
            worktree.queryDirectories.map((directory) => first.hasIncludedDescendant(directory)),
          );
          expect(second.appliedOverrides()).toEqual(first.appliedOverrides());
        });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("membership queries read only the construction-time snapshot after git's view changes", async () => {
    await assertProperty(
      IGNORE_SOURCE_TEST_GENERATOR.worktreeState(),
      async (state) => {
        await withGitWorktreeEnv(async (env) => {
          const worktree = await materializeIgnoreSourceWorktree(env, state);
          const reader = createIgnoreSourceReader(env.productDir, worktree.readerConfig);
          const pathsAtConstruction = worktree.queryPaths.map((path) => reader.isInIncludedSet(path));
          const directoriesAtConstruction = worktree.queryDirectories.map((directory) =>
            reader.hasIncludedDescendant(directory)
          );

          await mutateIgnoreSourceWorktree(env, state);

          expect(
            createIgnoreSourceReader(env.productDir, worktree.readerConfig).isInIncludedSet(
              state.topLevelNames.added,
            ),
          ).toBe(true);
          expect(worktree.queryPaths.map((path) => reader.isInIncludedSet(path))).toEqual(pathsAtConstruction);
          expect(worktree.queryDirectories.map((directory) => reader.hasIncludedDescendant(directory))).toEqual(
            directoriesAtConstruction,
          );
        });
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
