import { execa } from "execa";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { SessionDirectoryConfig } from "@/domains/session/show";
import { DEFAULT_CONFIG } from "../config/defaults";
import { withoutGitEnvironment } from "./environment";

// Result from product-directory detection.
export interface GitProductDirResult {
  /** Absolute path to product directory (or cwd if not in git repo) */
  productDir: string;
  /** Whether the directory is inside a git repository */
  isGitRepo: boolean;
  /** Warning message when not in a git repo (undefined if in repo) */
  warning?: string;
  /**
   * The local worktree root (`git rev-parse --show-toplevel`), set by
   * `detectGitCommonDirProductRoot` so a caller that needs both the worktree
   * root and the Git common-dir product root reads `--show-toplevel` once.
   * Falls back to `cwd` outside a git repository.
   */
  worktreeRoot?: string;
}

// Minimal command result shape used by product-directory detection.
export interface ExecResult {
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

// Dependencies for git operations.
export interface GitDependencies {
  // Execute a command.
  execa: (
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ) => Promise<ExecResult>;
}

// Default dependencies using real execa.
const defaultDeps: GitDependencies = {
  execa: async (command, args, options) => {
    const result = await execa(command, args, {
      ...options,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    return {
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    };
  },
};

export const NOT_GIT_REPO_WARNING =
  "Warning: Not in a git repository; resolving session storage relative to the current directory.";

export const GIT_ROOT_COMMAND = {
  EXECUTABLE: "git",
  REV_PARSE: "rev-parse",
  ABBREV_REF: "--abbrev-ref",
  GIT_COMMON_DIR: "--git-common-dir",
  HEAD: "HEAD",
  SHOW_TOPLEVEL: "--show-toplevel",
  SYMBOLIC_REF: "symbolic-ref",
  SHORT: "--short",
  ORIGIN_HEAD_REF: "refs/remotes/origin/HEAD",
  STATUS: "status",
  PORCELAIN: "--porcelain",
  PATH_FORMAT_ABSOLUTE: "--path-format=absolute",
} as const;

/** Prefix on the remote-tracking ref returned by `symbolic-ref refs/remotes/origin/HEAD`. */
export const ORIGIN_REF_PREFIX = "origin/";

export const GIT_SHOW_TOPLEVEL_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.SHOW_TOPLEVEL,
] as const;

// `--path-format=absolute` makes git emit an absolute common dir regardless of
// the working directory; without it `--git-common-dir` is relative to git's cwd
// (e.g. `../../.git` from a subdirectory), which misresolves against the toplevel.
export const GIT_COMMON_DIR_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.PATH_FORMAT_ABSOLUTE,
  GIT_ROOT_COMMAND.GIT_COMMON_DIR,
] as const;

export const GIT_CURRENT_BRANCH_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.ABBREV_REF,
  GIT_ROOT_COMMAND.HEAD,
] as const;

export const GIT_HEAD_SHA_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.HEAD,
] as const;

export const GIT_ORIGIN_HEAD_REF_ARGS = [
  GIT_ROOT_COMMAND.SYMBOLIC_REF,
  GIT_ROOT_COMMAND.SHORT,
  GIT_ROOT_COMMAND.ORIGIN_HEAD_REF,
] as const;

export const GIT_STATUS_PORCELAIN_ARGS = [
  GIT_ROOT_COMMAND.STATUS,
  GIT_ROOT_COMMAND.PORCELAIN,
] as const;

// Detects the local worktree product directory.
export async function detectWorktreeProductRoot(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<GitProductDirResult> {
  try {
    const result = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_SHOW_TOPLEVEL_ARGS],
      { cwd, reject: false },
    );

    // Git command succeeded - we're in a repo
    if (result.exitCode === 0 && result.stdout) {
      return {
        productDir: extractStdout(result.stdout),
        isGitRepo: true,
      };
    }

    // Git command failed - not in a repo
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  } catch {
    // Command execution failed (git not installed, permission error, etc.)
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  }
}

// Extracts a trimmed string from execa stdout.
function extractStdout(stdout: unknown): string {
  if (!stdout) return "";
  const str = typeof stdout === "string" ? stdout : String(stdout);
  return str.trim().replace(/\/+$/, "");
}

// Detects the Git common-dir product root, resolving through git worktrees.
export async function detectGitCommonDirProductRoot(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<GitProductDirResult> {
  try {
    // Step 1: Get the local worktree product directory via --show-toplevel
    const toplevelResult = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_SHOW_TOPLEVEL_ARGS],
      { cwd, reject: false },
    );

    if (toplevelResult.exitCode !== 0 || !toplevelResult.stdout) {
      return {
        productDir: cwd,
        isGitRepo: false,
        warning: NOT_GIT_REPO_WARNING,
        worktreeRoot: cwd,
      };
    }

    const toplevel = extractStdout(toplevelResult.stdout);

    // Step 2: Get the common git directory via --git-common-dir
    const commonDirResult = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_COMMON_DIR_ARGS],
      { cwd, reject: false },
    );

    if (commonDirResult.exitCode !== 0 || !commonDirResult.stdout) {
      // Fallback: if --git-common-dir fails, use toplevel
      return {
        productDir: toplevel,
        isGitRepo: true,
        worktreeRoot: toplevel,
      };
    }

    const commonDir = extractStdout(commonDirResult.stdout);

    // Step 3: Resolve the common dir to an absolute path. GIT_COMMON_DIR_ARGS
    // requests --path-format=absolute, so git emits an absolute path; the
    // relative branch is a defensive fallback for git builds that ignore it.
    const absoluteCommonDir = isAbsolute(commonDir)
      ? commonDir
      : resolve(toplevel, commonDir);

    // Step 4: The Git common-dir product root is the parent of the common .git directory
    const gitCommonDirProductRoot = dirname(absoluteCommonDir);

    return {
      productDir: gitCommonDirProductRoot,
      isGitRepo: true,
      worktreeRoot: toplevel,
    };
  } catch {
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
      worktreeRoot: cwd,
    };
  }
}

export function computeRelativeWorktreePath(commonDir: string, toplevel: string): string {
  const absoluteCommonDir = isAbsolute(commonDir)
    ? commonDir
    : resolve(toplevel, commonDir);
  const commonDirProductRoot = dirname(absoluteCommonDir);
  const worktreePath = relative(commonDirProductRoot, toplevel);
  return worktreePath === "" ? "" : worktreePath;
}

/**
 * Resolves the repository's default branch name from `origin/HEAD`
 * (e.g. `"main"`). Returns null when `origin/HEAD` is unset or unresolvable.
 */
export async function resolveDefaultBranch(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_ORIGIN_HEAD_REF_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const ref = extractStdout(result.stdout);
  if (!ref.startsWith(ORIGIN_REF_PREFIX)) return null;
  const branch = ref.slice(ORIGIN_REF_PREFIX.length);
  return branch.length === 0 ? null : branch;
}

/**
 * Returns the checked-out branch name, or null when HEAD is detached or the
 * branch name is unavailable.
 */
export async function getCurrentBranch(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_CURRENT_BRANCH_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const branch = extractStdout(result.stdout);
  if (branch.length === 0 || branch === GIT_ROOT_COMMAND.HEAD) return null;
  return branch;
}

/** Returns the HEAD commit SHA, or null when unavailable. */
export async function getHeadSha(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_HEAD_SHA_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const sha = extractStdout(result.stdout);
  return sha.length === 0 ? null : sha;
}

/**
 * Returns the commit SHA at the tip of the given ref (e.g. `"origin/main"`),
 * or null when the ref cannot be resolved.
 */
export async function resolveRefSha(
  ref: string,
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_ROOT_COMMAND.REV_PARSE, ref],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const sha = extractStdout(result.stdout);
  return sha.length === 0 ? null : sha;
}

/**
 * Whether the working tree at `cwd` is clean — `git status --porcelain` emits
 * nothing. A non-zero git exit is treated as not clean.
 */
export async function isWorkingTreeClean(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<boolean> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_STATUS_PORCELAIN_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return false;
  return extractStdout(result.stdout).length === 0;
}

/**
 * Whether `cwd` resolves to the repository's root worktree — the working tree
 * rooted at the Git common-dir product root (empty relative worktree path). A
 * linked worktree resolves to a non-empty relative path.
 */
export async function isRootWorktree(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<boolean> {
  const [toplevelResult, commonDirResult] = await Promise.all([
    deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_SHOW_TOPLEVEL_ARGS], { cwd, reject: false }),
    deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_COMMON_DIR_ARGS], { cwd, reject: false }),
  ]);
  if (toplevelResult.exitCode !== 0) return false;
  // Mirror detectGitCommonDirProductRoot's fallback: when --git-common-dir is
  // unavailable but --show-toplevel succeeded, treat the working tree as the
  // root worktree rather than misclassifying it as linked.
  if (commonDirResult.exitCode !== 0) return true;
  const toplevel = extractStdout(toplevelResult.stdout);
  const commonDir = extractStdout(commonDirResult.stdout);
  return computeRelativeWorktreePath(commonDir, toplevel) === "";
}

// Options for resolving session directory configuration.
export interface ResolveSessionConfigOptions {
  /** Explicit sessions directory (overrides auto-detection) */
  sessionsDir?: string;
  /** Current working directory for git detection */
  cwd?: string;
  /** Injectable dependencies for testing */
  deps?: GitDependencies;
}

// Result of session config resolution.
export interface ResolveSessionConfigResult {
  /** Resolved session directory configuration with absolute paths */
  config: SessionDirectoryConfig;
  /** Warning message if not in a git repository */
  warning?: string;
}

// Resolves session directory configuration with worktree-aware root detection.
export async function resolveSessionConfig(
  options: ResolveSessionConfigOptions = {},
): Promise<ResolveSessionConfigResult> {
  const { sessionsDir, cwd, deps } = options;
  const { statusDirs } = DEFAULT_CONFIG.sessions;

  // Explicit directory provided — use as-is
  if (sessionsDir) {
    return {
      config: {
        todoDir: join(sessionsDir, statusDirs.todo),
        doingDir: join(sessionsDir, statusDirs.doing),
        archiveDir: join(sessionsDir, statusDirs.archive),
      },
    };
  }

  // Auto-detect Git common-dir product root for .spx/ operations
  const gitResult = await detectGitCommonDirProductRoot(cwd, deps);
  const baseDir = join(gitResult.productDir, DEFAULT_CONFIG.sessions.dir);

  return {
    config: {
      todoDir: join(baseDir, statusDirs.todo),
      doingDir: join(baseDir, statusDirs.doing),
      archiveDir: join(baseDir, statusDirs.archive),
    },
    warning: gitResult.warning,
  };
}
