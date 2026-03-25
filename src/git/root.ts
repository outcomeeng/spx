/**
 * Git repository root detection utilities.
 *
 * Provides git root detection with dependency injection for testability.
 * Sessions should be created at the git repository root, not relative to cwd.
 *
 * @module git/root
 */

import { execa } from "execa";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { SessionDirectoryConfig } from "../session/show.js";

/**
 * Result from git root detection.
 */
export interface GitRootResult {
  /** Absolute path to git root (or cwd if not in git repo) */
  root: string;
  /** Whether the directory is inside a git repository */
  isGitRepo: boolean;
  /** Warning message when not in a git repo (undefined if in repo) */
  warning?: string;
}

/**
 * Minimal result type for command execution.
 * Captures only the fields git root detection depends on.
 */
export interface ExecResult {
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Dependencies for git operations (injectable for testing).
 */
export interface GitDependencies {
  /**
   * Execute a command.
   *
   * @param command - Command to execute
   * @param args - Command arguments
   * @param options - Execution options
   * @returns Promise resolving to command result
   */
  execa: (
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ) => Promise<ExecResult>;
}

/**
 * Default dependencies using real execa.
 */
const defaultDeps: GitDependencies = {
  execa: async (command, args, options) => {
    const result = await execa(command, args, options);
    return {
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    };
  },
};

/**
 * Warning message emitted when not in a git repository.
 */
const NOT_GIT_REPO_WARNING =
  "Warning: Not in a git repository. Sessions will be created relative to current directory.";

/**
 * Detects the git repository root directory.
 *
 * Uses `git rev-parse --show-toplevel` to find the repository root.
 * If not in a git repository, returns the current working directory with a warning.
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param deps - Injectable dependencies for testing
 * @returns GitRootResult with root path, git status, and optional warning
 *
 * @example
 * ```typescript
 * // In a git repo subdirectory
 * const result = await detectGitRoot('/repo/src/components');
 * // => { root: '/repo', isGitRepo: true }
 *
 * // Not in a git repo
 * const result = await detectGitRoot('/tmp/random');
 * // => { root: '/tmp/random', isGitRepo: false, warning: '...' }
 * ```
 */
export async function detectGitRoot(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<GitRootResult> {
  try {
    const result = await deps.execa(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, reject: false },
    );

    // Git command succeeded - we're in a repo
    if (result.exitCode === 0 && result.stdout) {
      return {
        root: extractStdout(result.stdout),
        isGitRepo: true,
      };
    }

    // Git command failed - not in a repo
    return {
      root: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  } catch {
    // Command execution failed (git not installed, permission error, etc.)
    return {
      root: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  }
}

/**
 * Extracts a trimmed string from execa stdout, handling all possible output types.
 */
function extractStdout(stdout: unknown): string {
  if (!stdout) return "";
  const str = typeof stdout === "string" ? stdout : String(stdout);
  return str.trim().replace(/\/+$/, "");
}

/**
 * Detects the main repository root, resolving through git worktrees.
 *
 * Uses `git rev-parse --git-common-dir` to find the shared `.git` directory,
 * then returns its parent as the main repository root. In a non-worktree
 * repository, this returns the same path as `detectGitRoot`.
 *
 * Per PDR-15, this function is used for `.spx/` (gitignored) operations
 * where state must be shared across all worktrees.
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param deps - Injectable dependencies for testing
 * @returns GitRootResult with main repo root path
 */
export async function detectMainRepoRoot(
  cwd: string = process.cwd(),
  deps: GitDependencies = defaultDeps,
): Promise<GitRootResult> {
  try {
    // Step 1: Get the worktree/repo root via --show-toplevel
    const toplevelResult = await deps.execa(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, reject: false },
    );

    if (toplevelResult.exitCode !== 0 || !toplevelResult.stdout) {
      return {
        root: cwd,
        isGitRepo: false,
        warning: NOT_GIT_REPO_WARNING,
      };
    }

    const toplevel = extractStdout(toplevelResult.stdout);

    // Step 2: Get the common git directory via --git-common-dir
    const commonDirResult = await deps.execa(
      "git",
      ["rev-parse", "--git-common-dir"],
      { cwd, reject: false },
    );

    if (commonDirResult.exitCode !== 0 || !commonDirResult.stdout) {
      // Fallback: if --git-common-dir fails, use toplevel
      return {
        root: toplevel,
        isGitRepo: true,
      };
    }

    const commonDir = extractStdout(commonDirResult.stdout);

    // Step 3: Resolve the common dir to an absolute path
    // --git-common-dir may return a relative path (e.g., ".git" or "../../../.git")
    const absoluteCommonDir = isAbsolute(commonDir)
      ? commonDir
      : resolve(toplevel, commonDir);

    // Step 4: The main repo root is the parent of the common .git directory
    const mainRepoRoot = dirname(absoluteCommonDir);

    return {
      root: mainRepoRoot,
      isGitRepo: true,
    };
  } catch {
    return {
      root: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  }
}

/**
 * Options for resolving session directory configuration.
 */
export interface ResolveSessionConfigOptions {
  /** Explicit sessions directory (overrides auto-detection) */
  sessionsDir?: string;
  /** Current working directory for git detection */
  cwd?: string;
  /** Injectable dependencies for testing */
  deps?: GitDependencies;
}

/**
 * Result of session config resolution.
 */
export interface ResolveSessionConfigResult {
  /** Resolved session directory configuration with absolute paths */
  config: SessionDirectoryConfig;
  /** Warning message if not in a git repository */
  warning?: string;
}

/**
 * Resolves session directory configuration with worktree-aware root detection.
 *
 * If `sessionsDir` is provided, uses it directly. Otherwise, detects the main
 * repository root via `detectMainRepoRoot` and builds absolute paths from
 * `DEFAULT_CONFIG`.
 *
 * Per PDR-15, session operations always resolve against the main repository
 * root (root worktree) so that `.spx/sessions/` is shared across all worktrees.
 *
 * @param options - Resolution options
 * @returns Resolved config with absolute paths and optional warning
 */
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

  // Auto-detect main repo root for .spx/ operations
  const gitResult = await detectMainRepoRoot(cwd, deps);
  const baseDir = join(gitResult.root, DEFAULT_CONFIG.sessions.dir);

  return {
    config: {
      todoDir: join(baseDir, statusDirs.todo),
      doingDir: join(baseDir, statusDirs.doing),
      archiveDir: join(baseDir, statusDirs.archive),
    },
    warning: gitResult.warning,
  };
}

/**
 * Builds an absolute session file path from git root and session ID.
 *
 * Pure function that constructs the path without I/O.
 * All path components come from the config parameter (single source of truth).
 *
 * @param gitRoot - Absolute path to git repository root
 * @param sessionId - Session timestamp ID (e.g., "2026-01-13_08-01-05")
 * @param config - Session directory configuration
 * @returns Absolute path to session file in todo directory
 *
 * @example
 * ```typescript
 * const path = buildSessionPathFromRoot(
 *   '/Users/dev/myproject',
 *   '2026-01-13_08-01-05',
 *   DEFAULT_SESSION_CONFIG,
 * );
 * // => '/Users/dev/myproject/.spx/sessions/todo/2026-01-13_08-01-05.md'
 * ```
 */
export function buildSessionPathFromRoot(
  gitRoot: string,
  sessionId: string,
  config: SessionDirectoryConfig,
): string {
  const filename = `${sessionId}.md`;

  // Build absolute path: git root + todo dir + filename
  // All components come from config (no hardcoded strings)
  return join(gitRoot, config.todoDir, filename);
}
