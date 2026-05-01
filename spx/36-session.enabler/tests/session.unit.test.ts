/**
 * Unit tests for worktree-aware session root detection and config resolution.
 *
 * Level 1: DI-injected execa for path logic, real git for worktree tests.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { detectGitRoot, detectMainRepoRoot, type GitDependencies, resolveSessionConfig } from "@/git/root";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  runGit,
  runTsxEval,
} from "@test/harness/git-test-constants";

const POLLUTED_GIT_DIR = "/tmp/nonexistent-git-dir";
const POLLUTED_GIT_WORK_TREE = "/tmp/nonexistent-git-work-tree";
const SESSION_ROOT_TEST_CWD_ENV = "SPX_SESSION_ROOT_TEST_CWD";

interface DetectedRoots {
  readonly gitRoot: string;
  readonly mainRoot: string;
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
  if (typeof parsed.gitRoot !== "string" || typeof parsed.mainRoot !== "string") {
    throw new Error("Session root child process returned invalid JSON");
  }
  return {
    gitRoot: parsed.gitRoot,
    mainRoot: parsed.mainRoot,
  };
}

async function detectRootsInChildProcess(
  cwd: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<DetectedRoots> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/git/root.ts")).href;
  const script = `
    import { detectGitRoot, detectMainRepoRoot } from ${JSON.stringify(moduleUrl)};
    async function main() {
      const cwd = process.env.${SESSION_ROOT_TEST_CWD_ENV};
      if (cwd === undefined) {
        throw new Error("Missing ${SESSION_ROOT_TEST_CWD_ENV}");
      }
      const gitRoot = await detectGitRoot(cwd);
      const mainRoot = await detectMainRepoRoot(cwd);
      console.log(JSON.stringify({ gitRoot: gitRoot.root, mainRoot: mainRoot.root }));
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
// detectMainRepoRoot with DI (pure path logic)
// ============================================================

describe("detectMainRepoRoot with dependency injection", () => {
  it("GIVEN non-worktree repo WHEN --git-common-dir returns .git THEN root equals --show-toplevel", async () => {
    const repoRoot = "/repo";
    // In a non-worktree repo, --git-common-dir returns ".git" (relative)
    // and --show-toplevel returns the repo root.
    // dirname(resolve(toplevel, ".git")) === toplevel
    const deps = createMockDeps([
      { stdout: repoRoot, exitCode: 0 }, // --show-toplevel
      { stdout: ".git", exitCode: 0 }, // --git-common-dir
    ]);

    const result = await detectMainRepoRoot(join(repoRoot, "src"), deps);

    expect(result.root).toBe(repoRoot);
    expect(result.isGitRepo).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN worktree WHEN --git-common-dir returns absolute path THEN root is parent of common dir", async () => {
    const mainRepoRoot = "/repo";
    const worktreeRoot = join(mainRepoRoot, ".claude", "worktrees", "my-branch");
    // In a worktree, --git-common-dir returns the absolute path to the main repo's .git
    const deps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 }, // --show-toplevel
      { stdout: join(mainRepoRoot, ".git"), exitCode: 0 }, // --git-common-dir
    ]);

    const result = await detectMainRepoRoot(join(worktreeRoot, "src"), deps);

    expect(result.root).toBe(mainRepoRoot);
    expect(result.isGitRepo).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN worktree WHEN --git-common-dir returns relative path THEN resolves against toplevel", async () => {
    const mainRepoRoot = "/repo";
    const worktreeRoot = join(mainRepoRoot, ".claude", "worktrees", "my-branch");
    // Some git versions return relative paths from --git-common-dir
    const deps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 }, // --show-toplevel
      { stdout: "../../../.git", exitCode: 0 }, // --git-common-dir (relative)
    ]);

    const result = await detectMainRepoRoot(worktreeRoot, deps);

    // resolve("/repo/.claude/worktrees/my-branch", "../../../.git") = "/repo/.git"
    // dirname("/repo/.git") = "/repo"
    expect(result.root).toBe(mainRepoRoot);
    expect(result.isGitRepo).toBe(true);
  });

  it("GIVEN not a git repo WHEN detecting THEN returns cwd with warning", async () => {
    const cwd = "/not/a/repo";
    const deps = createMockDeps([
      { stdout: "", exitCode: 128 }, // --show-toplevel fails
    ]);

    const result = await detectMainRepoRoot(cwd, deps);

    expect(result.root).toBe(cwd);
    expect(result.isGitRepo).toBe(false);
    expect(result.warning).toBeDefined();
  });
});

// ============================================================
// detectMainRepoRoot vs detectGitRoot divergence in worktrees
// ============================================================

describe("detectMainRepoRoot vs detectGitRoot in worktrees", () => {
  it("GIVEN worktree WHEN both functions called THEN they return different roots", async () => {
    const worktreeRoot = "/repo/.claude/worktrees/feature-branch";
    const mainRepoRoot = "/repo";

    // detectGitRoot uses --show-toplevel → worktree root
    const gitRootDeps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
    ]);
    const gitRootResult = await detectGitRoot(worktreeRoot, gitRootDeps);

    // detectMainRepoRoot uses --git-common-dir → main repo root
    const mainRepoDeps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
      { stdout: `${mainRepoRoot}/.git`, exitCode: 0 },
    ]);
    const mainRepoResult = await detectMainRepoRoot(worktreeRoot, mainRepoDeps);

    expect(gitRootResult.root).toBe(worktreeRoot);
    expect(mainRepoResult.root).toBe(mainRepoRoot);
    expect(gitRootResult.root).not.toBe(mainRepoResult.root);
  });

  it("GIVEN non-worktree repo WHEN both functions called THEN they return the same root", async () => {
    const repoRoot = "/repo";

    const gitRootDeps = createMockDeps([
      { stdout: repoRoot, exitCode: 0 },
    ]);
    const gitRootResult = await detectGitRoot(repoRoot, gitRootDeps);

    const mainRepoDeps = createMockDeps([
      { stdout: repoRoot, exitCode: 0 },
      { stdout: ".git", exitCode: 0 },
    ]);
    const mainRepoResult = await detectMainRepoRoot(repoRoot, mainRepoDeps);

    expect(gitRootResult.root).toBe(repoRoot);
    expect(mainRepoResult.root).toBe(repoRoot);
  });
});

// ============================================================
// Real git worktree tests (Level 1 — git is a standard dev tool)
// ============================================================

describe("detectMainRepoRoot with real git worktrees", () => {
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

  it("GIVEN real worktree WHEN detectMainRepoRoot THEN returns main repo root", async () => {
    const wtPath = join(worktreeDir, "my-wt");
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, wtPath, "-b", "test-branch"]);
    const canonicalWtPath = realpathSync(wtPath);

    // detectGitRoot from worktree → worktree root
    const gitRootResult = await detectGitRoot(canonicalWtPath);
    expect(gitRootResult.root).toBe(canonicalWtPath);

    // detectMainRepoRoot from worktree → main repo root
    const mainRepoResult = await detectMainRepoRoot(canonicalWtPath);
    expect(mainRepoResult.root).toBe(repoDir);
    expect(mainRepoResult.isGitRepo).toBe(true);
  });

  it("GIVEN real worktree subdirectory WHEN detectMainRepoRoot THEN still returns main repo root", async () => {
    const wtPath = join(worktreeDir, "my-wt");
    await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, wtPath, "-b", "test-branch"]);

    const subDir = join(wtPath, "src", "deep");
    mkdirSync(subDir, { recursive: true });
    const canonicalSubDir = realpathSync(subDir);

    const result = await detectMainRepoRoot(canonicalSubDir);
    expect(result.root).toBe(repoDir);
  });

  it("GIVEN non-worktree repo WHEN detectMainRepoRoot THEN returns same as detectGitRoot", async () => {
    const gitRootResult = await detectGitRoot(repoDir);
    const mainRepoResult = await detectMainRepoRoot(repoDir);

    expect(gitRootResult.root).toBe(mainRepoResult.root);
    expect(mainRepoResult.root).toBe(repoDir);
  });

  it("GIVEN hook Git variables WHEN detecting repo roots THEN cwd repo wins", async () => {
    const roots = await detectRootsInChildProcess(repoDir, {
      GIT_DIR: POLLUTED_GIT_DIR,
      GIT_WORK_TREE: POLLUTED_GIT_WORK_TREE,
    });

    expect(roots.gitRoot).toBe(repoDir);
    expect(roots.mainRoot).toBe(repoDir);
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

  it("GIVEN no sessionsDir WHEN resolving THEN detects main repo root and builds absolute paths", async () => {
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

  it("GIVEN worktree WHEN resolving THEN uses main repo root not worktree root", async () => {
    const mainRepoRoot = "/repo";
    const worktreeRoot = join(mainRepoRoot, ".claude", "worktrees", "topic");
    const deps = createMockDeps([
      { stdout: worktreeRoot, exitCode: 0 },
      { stdout: join(mainRepoRoot, ".git"), exitCode: 0 },
    ]);

    const result = await resolveSessionConfig({ deps });

    expect(result.config.todoDir).toBe(
      join(mainRepoRoot, DEFAULT_CONFIG.sessions.dir, DEFAULT_CONFIG.sessions.statusDirs.todo),
    );
    expect(result.config.todoDir).not.toContain(worktreeRoot);
  });
});
