import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

import {
  fileContent,
  ignoredPattern,
  PROPERTY_NUM_RUNS,
  readerConfig,
  trackedFilePath,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source — properties", () => {
  it("reader membership is deterministic across readers constructed from the same worktree state", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (noIgnore) => {
        await withGitWorktreeEnv(async (env) => {
          const tracked = trackedFilePath();
          const ignored = ignoredPattern();
          await env.writeTracked(tracked, fileContent());
          await env.writeGitignore(".", ignored);
          await env.writeUntracked(ignored, fileContent());

          const first = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnore }));
          const second = createIgnoreSourceReader(env.productDir, readerConfig({ noIgnore }));

          expect(first.isInIncludedSet(tracked)).toBe(second.isInIncludedSet(tracked));
          expect(first.isInIncludedSet(ignored)).toBe(second.isInIncludedSet(ignored));
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("reader membership is a construction-time snapshot", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (startIgnored) => {
        await withGitWorktreeEnv(async (env) => {
          const path = ignoredPattern();
          if (startIgnored) {
            await env.writeGitignore(".", path);
          }
          await env.writeUntracked(path, fileContent());
          const reader = createIgnoreSourceReader(env.productDir, readerConfig());
          if (startIgnored) {
            await env.writeGitignore(".", "");
          } else {
            await env.writeGitignore(".", path);
          }

          expect(reader.isInIncludedSet(path)).toBe(!startIgnored);
          expect(createIgnoreSourceReader(env.productDir, readerConfig()).isInIncludedSet(path)).toBe(startIgnored);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
