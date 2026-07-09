import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  gatherGitFacts,
  GIT_COMMON_DIR_ARGS,
  GIT_CORE_BARE_ARGS,
  GIT_CORE_BARE_TRUE,
  GIT_DIR_BASENAME,
  GIT_REMOTE_GET_URL_ORIGIN_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
  type GitDependencies,
  isMainCheckout,
  mainCheckoutPath,
} from "@/lib/git/root";
import {
  arbitraryNonBareMainFacts,
  arbitraryPoolFactsSample,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { gitArgsEqual } from "@testing/harnesses/git-test-constants";

/**
 * A git double driving `gatherGitFacts`'s probe fallbacks: `--show-toplevel`
 * returns `toplevel`, `--git-common-dir` returns `commonDirExit`, and `origin`
 * resolves `originUrl` (or fails when null).
 */
function probeDeps(
  toplevel: { exitCode: number; stdout: string },
  commonDirExit: number,
  originUrl: string | null,
  options: {
    readonly commonDirStdout?: string;
    readonly commonDirIsBare?: boolean;
    readonly worktreeListStdout?: string;
    readonly worktreeListExitCode?: number;
  } = {},
): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        return { exitCode: toplevel.exitCode, stdout: toplevel.stdout, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_COMMON_DIR_ARGS)) {
        return { exitCode: commonDirExit, stdout: options.commonDirStdout ?? "", stderr: "" };
      }
      if (gitArgsEqual(args, GIT_REMOTE_GET_URL_ORIGIN_ARGS)) {
        return originUrl === null
          ? { exitCode: 1, stdout: "", stderr: "" }
          : { exitCode: 0, stdout: originUrl, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_WORKTREE_LIST_PORCELAIN_ARGS)) {
        return {
          exitCode: options.worktreeListExitCode ?? 1,
          stdout: options.worktreeListStdout ?? "",
          stderr: "",
        };
      }
      if (gitArgsEqual(args, GIT_CORE_BARE_ARGS)) {
        return {
          exitCode: 0,
          stdout: options.commonDirIsBare === true ? GIT_CORE_BARE_TRUE : GIT_CORE_BARE_TRUE.toUpperCase(),
          stderr: "",
        };
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
      worktreeRoots: [],
      worktreeListRead: false,
      commonDir: join(facts.worktreeRoot, GIT_DIR_BASENAME),
      commonDirIsBare: false,
      originUrl: facts.originUrl,
    });
    // The fallback shape designates the main checkout, matching detectGitCommonDirProductRoot.
    expect(result !== null && isMainCheckout(result)).toBe(true);
  });

  it("GIVEN worktree list fails in a bare pool THEN the probe records no observed roots and classification is non-main", async () => {
    const facts = sampleMainCheckoutTestValue(arbitraryPoolFactsSample()).mainCheckout;
    const deps = probeDeps(
      { exitCode: 0, stdout: facts.worktreeRoot },
      0,
      facts.originUrl,
      { commonDirStdout: facts.commonDir, commonDirIsBare: true },
    );

    const result = await gatherGitFacts(facts.worktreeRoot, deps);

    expect(result?.worktreeRoots).toEqual([]);
    expect(result?.worktreeListRead).toBe(false);
    expect(result !== null && isMainCheckout(result)).toBe(false);
  });

  it("GIVEN worktree list reports a prunable repository-named pool worktree THEN the probe excludes it from observed roots", async () => {
    const facts = sampleMainCheckoutTestValue(arbitraryPoolFactsSample()).mainCheckout;
    const deps = probeDeps(
      { exitCode: 0, stdout: facts.worktreeRoot },
      0,
      facts.originUrl,
      {
        commonDirStdout: facts.commonDir,
        commonDirIsBare: true,
        worktreeListExitCode: 0,
        worktreeListStdout: [
          `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${facts.worktreeRoot}`,
          `${GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX}${facts.worktreeRoot}`,
        ].join("\n"),
      },
    );

    const result = await gatherGitFacts(facts.worktreeRoot, deps);

    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.worktreeRoots).toEqual([]);
    expect(result.worktreeListRead).toBe(true);
    expect(isMainCheckout(result)).toBe(false);
    expect(mainCheckoutPath(result)).toBeNull();
  });
});
