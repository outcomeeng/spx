import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import {
  computeRelativeWorktreePath,
  detectGitCommonDirProductRoot,
  detectWorktreeProductRoot,
  type GitDependencies,
  isRootWorktree,
  resolveSessionConfig,
} from "@/git/root";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  runGit,
  runTsxEval,
} from "@testing/harnesses/git-test-constants";

const POLLUTED_GIT_DIR = "/tmp/nonexistent-git-dir";
const POLLUTED_GIT_WORK_TREE = "/tmp/nonexistent-git-work-tree";
const SESSION_ROOT_TEST_CWD_ENV = "SPX_SESSION_ROOT_TEST_CWD";

interface DetectedRoots {
  readonly worktreeProductRoot: string;
  readonly gitCommonDirProductRoot: string;
}

// -- Helper: create a GitDependencies that returns controlled results --

function createMockDeps(responses: Array<{ stdout: string; exitCode: number }>): GitDependencies {
  let callIndex = 0;
  return {
    execa: async (
      _command: string,
      _args: string[],
      _options?: { cwd?: string; reject?: boolean },
    ) => {
      const response = responses[callIndex++] ?? { stdout: "", exitCode: 128 };
      return {
        stdout: response.exitCode === 0 ? response.stdout : "",
        stderr: "",
        exitCode: response.exitCode,
      };
    },
  };
}

function parseDetectedRoots(stdout: string): DetectedRoots {
  const parsed = JSON.parse(stdout) as Partial<DetectedRoots>;
  if (typeof parsed.worktreeProductRoot !== "string" || typeof parsed.gitCommonDirProductRoot !== "string") {
    throw new Error("Session root child process returned invalid JSON");
  }
  return {
    worktreeProductRoot: parsed.worktreeProductRoot,
    gitCommonDirProductRoot: parsed.gitCommonDirProductRoot,
  };
}

async function detectRootsInChildProcess(
  cwd: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<DetectedRoots> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/git/root.ts")).href;
  const script = `
    import { detectWorktreeProductRoot, detectGitCommonDirProductRoot } from ${JSON.stringify(moduleUrl)};
    async function main() {
      const cwd = process.env.${SESSION_ROOT_TEST_CWD_ENV};
      if (cwd === undefined) {
        throw new Error("Missing ${SESSION_ROOT_TEST_CWD_ENV}");
      }
      const worktreeProductRoot = await detectWorktreeProductRoot(cwd);
      const gitCommonDirProductRoot = await detectGitCommonDirProductRoot(cwd);
      console.log(JSON.stringify({ worktreeProductRoot: worktreeProductRoot.productDir, gitCommonDirProductRoot: gitCommonDirProductRoot.productDir }));
    }
    main().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const stdout = await runTsxEval(process.cwd(), script, {
    ...envOverrides,
    [SESSION_ROOT_TEST_CWD_ENV]: cwd,
  });
  return parseDetectedRoots(stdout);
}

// ============================================================
// detectGitCommonDirProductRoot with DI (pure path logic)
// ============================================================

describe("detectGitCommonDirProductRoot with dependency injection", () => {
  it("GIVEN non-worktree repo WHEN --git-common-dir returns the absolute .git path THEN root equals --show-toplevel", async () => {
    const productDir = "/repo";
    // GIT_COMMON_DIR_ARGS requests --path-format=absolute, so git emits the
    // absolute common dir; in a non-worktree repo it sits directly under toplevel.
    // dirname("/repo/.git") === "/repo"
    const deps = createMockDeps([
      { stdout: productDir, exitCode: 0 }, // --show-toplevel
      { stdout: join(productDir, ".git"), exitCode: 0 }, // --git-common-dir
    ]);

    const result = await detectGitCommonDirProductRoot(join(productDir, "src"), deps);

    expect(result.productDir).toBe(productDir);
    expect(result.isGitRepo).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN worktree WHEN --git-common-dir returns absolute path THEN root is parent of common dir", async () => {
    const gitCommonDirProductRoot = "/repo";
    const worktreeRoot = join(gitCommonDirProductRoot, ".claude", "worktrees", "my-branch");
    // In a worktree, --git-common-dir returns the absolute path to the Git common-dir product's .git
    const deps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 }, // --show-toplevel
      { stdout: join(gitCommonDirProductRoot, ".git"), exitCode: 0 }, // --git-common-dir
    ]);

    const result = await detectGitCommonDirProductRoot(join(worktreeRoot, "src"), deps);

    expect(result.productDir).toBe(gitCommonDirProductRoot);
    expect(result.isGitRepo).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN not a git repo WHEN detecting THEN returns cwd with warning", async () => {
    const cwd = "/not/a/repo";
    const deps = createMockDeps([
      { stdout: "", exitCode: 128 }, // --show-toplevel fails
    ]);

    const result = await detectGitCommonDirProductRoot(cwd, deps);

    expect(result.productDir).toBe(cwd);
    expect(result.isGitRepo).toBe(false);
    expect(result.warning).toBeDefined();
  });
});

// ============================================================
// detectGitCommonDirProductRoot vs detectWorktreeProductRoot divergence in worktrees
// ============================================================

describe("detectGitCommonDirProductRoot vs detectWorktreeProductRoot in worktrees", () => {
  it("GIVEN worktree WHEN both functions called THEN they return different roots", async () => {
    const worktreeRoot = "/repo/.claude/worktrees/topic-branch";
    const gitCommonDirProductRoot = "/repo";

    // detectWorktreeProductRoot uses --show-toplevel → worktree root
    const worktreeProductRootDeps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
    ]);
    const worktreeProductRootResult = await detectWorktreeProductRoot(worktreeRoot, worktreeProductRootDeps);

    // detectGitCommonDirProductRoot uses --git-common-dir → Git common-dir product root
    const gitCommonDirProductRootDeps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
      { stdout: `${gitCommonDirProductRoot}/.git`, exitCode: 0 },
    ]);
    const gitCommonDirProductRootResult = await detectGitCommonDirProductRoot(
      worktreeRoot,
      gitCommonDirProductRootDeps,
    );

    expect(worktreeProductRootResult.productDir).toBe(worktreeRoot);
    expect(gitCommonDirProductRootResult.productDir).toBe(gitCommonDirProductRoot);
    expect(worktreeProductRootResult.productDir).not.toBe(gitCommonDirProductRootResult.productDir);
  });

  it("GIVEN non-worktree repo WHEN both functions called THEN they return the same root", async () => {
    const productDir = "/repo";

    const worktreeProductRootDeps = createMockDeps([
      { stdout: productDir, exitCode: 0 },
    ]);
    const worktreeProductRootResult = await detectWorktreeProductRoot(productDir, worktreeProductRootDeps);

    const gitCommonDirProductRootDeps = createMockDeps([
      { stdout: productDir, exitCode: 0 },
      { stdout: join(productDir, ".git"), exitCode: 0 },
    ]);
    const gitCommonDirProductRootResult = await detectGitCommonDirProductRoot(productDir, gitCommonDirProductRootDeps);

    expect(worktreeProductRootResult.productDir).toBe(productDir);
    expect(gitCommonDirProductRootResult.productDir).toBe(productDir);
  });
});

describe("computeRelativeWorktreePath", () => {
  it("GIVEN common dir and toplevel for a worktree WHEN computed THEN returns path relative to common product root", () => {
    const result = computeRelativeWorktreePath("/repo/.git", "/repo/.codex/worktrees/topic");

    expect(result).toBe(join(".codex", "worktrees", "topic"));
  });

  it("GIVEN common dir and toplevel for main worktree WHEN computed THEN returns empty string", () => {
    const result = computeRelativeWorktreePath(".git", "/repo");

    expect(result).toBe("");
  });

  it("GIVEN a relative multi-level common dir WHEN computed THEN resolves it against toplevel", () => {
    // Defensive: GIT_COMMON_DIR_ARGS requests --path-format=absolute so production
    // never feeds a relative common dir, but the helper still resolves one.
    const result = computeRelativeWorktreePath("../../../.git", "/repo/.claude/worktrees/my-branch");

    expect(result).toBe(join(".claude", "worktrees", "my-branch"));
  });
});

describe("isRootWorktree with dependency injection", () => {
  it("GIVEN --git-common-dir fails but --show-toplevel succeeds WHEN classifying THEN treats the working tree as root", async () => {
    // Matches detectGitCommonDirProductRoot's fallback so the two never disagree.
    const deps = createMockDeps([
      { stdout: "/repo", exitCode: 0 }, // --show-toplevel
      { stdout: "", exitCode: 128 }, // --git-common-dir fails
    ]);

    expect(await isRootWorktree("/repo", deps)).toBe(true);
  });

  it("GIVEN --show-toplevel fails WHEN classifying THEN it is not the root worktree", async () => {
    const deps = createMockDeps([
      { stdout: "", exitCode: 128 }, // --show-toplevel fails
      { stdout: "", exitCode: 128 }, // --git-common-dir
    ]);

    expect(await isRootWorktree("/not/a/repo", deps)).toBe(false);
  });
});

// ============================================================
// Real git worktree tests (Level 1 — git is a standard dev tool)
// ============================================================

describe("detectGitCommonDirProductRoot with real git worktrees", () => {
  let repoDir: string;
  let worktreeDir: string;

  beforeEach(async () => {
    // Create a minimal git repo without lefthook (avoids hook conflicts)
    repoDir = realpathSync(mkdtempSync(join(tmpdir(), "worktree-repo-")));
    worktreeDir = realpathSync(mkdtempSync(join(tmpdir(), "worktree-wt-")));

    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.ALLOW_EMPTY, "-m", "initial"]);
  });

  afterEach(() => {
    // Remove worktree before repo (worktree references repo's .git)
    rmSync(worktreeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("GIVEN real worktree WHEN detectGitCommonDirProductRoot THEN returns Git common-dir product root", async () => {
    const wtPath = join(worktreeDir, "my-wt");
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, wtPath, "-b", "test-branch"]);
    const canonicalWtPath = realpathSync(wtPath);

    // detectWorktreeProductRoot from worktree → worktree root
    const worktreeProductRootResult = await detectWorktreeProductRoot(canonicalWtPath);
    expect(worktreeProductRootResult.productDir).toBe(canonicalWtPath);

    // detectGitCommonDirProductRoot from worktree → Git common-dir product root
    const gitCommonDirProductRootResult = await detectGitCommonDirProductRoot(canonicalWtPath);
    expect(gitCommonDirProductRootResult.productDir).toBe(repoDir);
    expect(gitCommonDirProductRootResult.isGitRepo).toBe(true);
  });

  it("GIVEN real worktree subdirectory WHEN detectGitCommonDirProductRoot THEN still returns Git common-dir product root", async () => {
    const wtPath = join(worktreeDir, "my-wt");
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, wtPath, "-b", "test-branch"]);

    const subDir = join(wtPath, "src", "deep");
    mkdirSync(subDir, { recursive: true });
    const canonicalSubDir = realpathSync(subDir);

    const result = await detectGitCommonDirProductRoot(canonicalSubDir);
    expect(result.productDir).toBe(repoDir);
  });

  it("GIVEN the root worktree WHEN isRootWorktree runs from a subdirectory THEN it returns true", async () => {
    const subDir = join(repoDir, "src", "deep");
    mkdirSync(subDir, { recursive: true });

    expect(await isRootWorktree(realpathSync(subDir))).toBe(true);
  });

  it("GIVEN a linked worktree WHEN isRootWorktree runs THEN it returns false", async () => {
    const wtPath = join(worktreeDir, "my-wt");
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, wtPath, "-b", "test-branch"]);

    expect(await isRootWorktree(realpathSync(wtPath))).toBe(false);
  });

  it("GIVEN non-worktree repo WHEN detectGitCommonDirProductRoot THEN returns same as detectWorktreeProductRoot", async () => {
    const worktreeProductRootResult = await detectWorktreeProductRoot(repoDir);
    const gitCommonDirProductRootResult = await detectGitCommonDirProductRoot(repoDir);

    expect(worktreeProductRootResult.productDir).toBe(gitCommonDirProductRootResult.productDir);
    expect(gitCommonDirProductRootResult.productDir).toBe(repoDir);
  });

  it("GIVEN hook Git variables WHEN detecting product directories THEN cwd repo wins", async () => {
    const roots = await detectRootsInChildProcess(repoDir, {
      GIT_DIR: POLLUTED_GIT_DIR,
      GIT_WORK_TREE: POLLUTED_GIT_WORK_TREE,
    });

    expect(roots.worktreeProductRoot).toBe(repoDir);
    expect(roots.gitCommonDirProductRoot).toBe(repoDir);
  });
});

// ============================================================
// resolveSessionConfig
// ============================================================

describe("resolveSessionConfig", () => {
  it("GIVEN explicit sessionsDir WHEN resolving THEN uses provided path", async () => {
    const sessionsDir = "/custom/sessions";
    const result = await resolveSessionConfig({ sessionsDir });

    expect(result.config.todoDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.todo));
    expect(result.config.doingDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.doing));
    expect(result.config.archiveDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.archive));
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN no sessionsDir WHEN resolving THEN detects Git common-dir product root and builds absolute paths", async () => {
    const deps = createMockDeps([
      { stdout: "/repo", exitCode: 0 },
      { stdout: ".git", exitCode: 0 },
    ]);

    const result = await resolveSessionConfig({ deps });

    const expectedBase = join("/repo", DEFAULT_CONFIG.sessions.dir);
    expect(result.config.todoDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.todo));
    expect(result.config.doingDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.doing));
    expect(result.config.archiveDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.archive));
  });

  it("GIVEN not in git repo WHEN resolving THEN uses cwd and emits warning", async () => {
    const cwd = "/not/a/repo";
    const deps = createMockDeps([
      { stdout: "", exitCode: 128 },
    ]);

    const result = await resolveSessionConfig({ deps, cwd });

    expect(result.config.todoDir).toBe(join(cwd, DEFAULT_CONFIG.sessions.dir, DEFAULT_CONFIG.sessions.statusDirs.todo));
    expect(result.warning).toBeDefined();
  });

  it("GIVEN worktree WHEN resolving THEN uses Git common-dir product root not worktree root", async () => {
    const gitCommonDirProductRoot = "/repo";
    const worktreeRoot = join(gitCommonDirProductRoot, ".claude", "worktrees", "topic");
    const deps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
      { stdout: join(gitCommonDirProductRoot, ".git"), exitCode: 0 },
    ]);

    const result = await resolveSessionConfig({ deps });

    expect(result.config.todoDir).toBe(
      join(gitCommonDirProductRoot, DEFAULT_CONFIG.sessions.dir, DEFAULT_CONFIG.sessions.statusDirs.todo),
    );
    expect(result.config.todoDir).not.toContain(worktreeRoot);
  });
});
