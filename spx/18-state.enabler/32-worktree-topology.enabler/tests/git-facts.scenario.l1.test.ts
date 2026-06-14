import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  gatherGitFacts,
  GIT_COMMON_DIR_ARGS,
  GIT_DIR_BASENAME,
  GIT_REMOTE_GET_URL_ORIGIN_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type GitDependencies,
  isMainCheckout,
} from "@/git/root";
import {
  arbitraryNonBareMainFacts,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";

function argsEqual(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

/**
 * A git double driving `gatherGitFacts`'s probe fallbacks: `--show-toplevel`
 * returns `toplevel`, `--git-common-dir` returns `commonDirExit`, and `origin`
 * resolves `originUrl` (or fails when null).
 */
function probeDeps(
  toplevel: { exitCode: number; stdout: string },
  commonDirExit: number,
  originUrl: string | null,
): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (argsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        return { exitCode: toplevel.exitCode, stdout: toplevel.stdout, stderr: "" };
      }
      if (argsEqual(args, GIT_COMMON_DIR_ARGS)) {
        return { exitCode: commonDirExit, stdout: "", stderr: "" };
      }
      if (argsEqual(args, GIT_REMOTE_GET_URL_ORIGIN_ARGS)) {
        return originUrl === null
          ? { exitCode: 1, stdout: "", stderr: "" }
          : { exitCode: 0, stdout: originUrl, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    },
  };
}

describe("gatherGitFacts — git-probe fallbacks", () => {
  it("GIVEN --show-toplevel fails THEN gatherGitFacts returns null", async () => {
    const facts = sampleMainCheckoutTestValue(arbitraryNonBareMainFacts());
    const deps = probeDeps({ exitCode: 1, stdout: "" }, 1, facts.originUrl);

    expect(await gatherGitFacts(facts.worktreeRoot, deps)).toBeNull();
  });

  it("GIVEN --git-common-dir fails but --show-toplevel succeeds THEN it falls back to a non-bare single-tree shape that is the main checkout", async () => {
    const facts = sampleMainCheckoutTestValue(arbitraryNonBareMainFacts());
    const deps = probeDeps({ exitCode: 0, stdout: facts.worktreeRoot }, 1, facts.originUrl);

    const result = await gatherGitFacts(facts.worktreeRoot, deps);

    expect(result).toEqual({
      worktreeRoot: facts.worktreeRoot,
      worktreeRoots: [facts.worktreeRoot],
      commonDir: join(facts.worktreeRoot, GIT_DIR_BASENAME),
      commonDirIsBare: false,
      originUrl: facts.originUrl,
    });
    // The fallback shape designates the main checkout, matching detectGitCommonDirProductRoot.
    expect(result !== null && isMainCheckout(result)).toBe(true);
  });
});
