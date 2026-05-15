/**
 * Git product-directory detection utilities.
 *
 * Provides product-directory detection with dependency injection for testability.
 * Sessions should be created at the Git common-dir product root, not relative to cwd.
 *
 * @module git/root
 */

import { execa } from "execa";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { SessionDirectoryConfig } from "@/domains/session/show";
import { DEFAULT_CONFIG } from "../config/defaults";
import { withoutGitEnvironment } from "./environment";

/**
 * Result from product-directory detection.
 */
export interface GitProductDirResult {
  /** Absolute path to product directory (or cwd if not in git repo) */
  productDir: string;
  /** Whether the directory is inside a git repository */
  isGitRepo: boolean;
  /** Warning message when not in a git repo (undefined if in repo) */
  warning?: string;
}

/**
 * Minimal result type for command execution.
 * Captures only the fields product-directory detection depends on.
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

const NOT_GIT_REPO_WARNING =
  "Warning: Not in a git repository. Sessions will be created relative to current directory.";

export const GIT_ROOT_COMMAND = {
  EXECUTABLE: "git",
  REV_PARSE: "rev-parse",
  GIT_COMMON_DIR: "--git-common-dir",
  SHOW_TOPLEVEL: "--show-toplevel",
} as const;

export const GIT_SHOW_TOPLEVEL_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.SHOW_TOPLEVEL,
] as const;

export const GIT_COMMON_DIR_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.GIT_COMMON_DIR,
] as const;

/**
 * Detects the local worktree product directory.
 *
 * Uses `git rev-parse --show-toplevel` to find the tracked-file product directory.
 * If not in a git repository, returns the current working directory with a warning.
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param deps - Injectable dependencies for testing
 * @returns GitProductDirResult with productDir path, git status, and optional warning
 *
 * @example
 * ```typescript
 * // In a git repo subdirectory
 * const result = await detectWorktreeProductRoot('/repo/src/components');
 * // => { productDir: '/repo', isGitRepo: true }
 *
 * // Not in a git repo
 * const result = await detectWorktreeProductRoot('/tmp/random');
 * // => { productDir: '/tmp/random', isGitRepo: false, warning: '...' }
 * ```
 */
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

/**
 * Extracts a trimmed string from execa stdout, handling all possible output types.
 */
function extractStdout(stdout: unknown): string {
  if (!stdout) return "";
  const str = typeof stdout === "string" ? stdout : String(stdout);
  return str.trim().replace(/\/+$/, "");
}

/**
 * Detects the Git common-dir product root, resolving through git worktrees.
 *
 * Uses `git rev-parse --git-common-dir` to find the shared `.git` directory,
 * then returns its parent as the Git common-dir product root. In a non-worktree
 * repository, this returns the same path as `detectWorktreeProductRoot`.
 *
 * This function supports `.spx/` operations where state must be shared across
 * all worktrees.
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param deps - Injectable dependencies for testing
 * @returns GitProductDirResult with Git common-dir product root path
 */
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
      };
    }

    const commonDir = extractStdout(commonDirResult.stdout);

    // Step 3: Resolve the common dir to an absolute path
    // --git-common-dir may return a relative path (e.g., ".git" or "../../../.git")
    const absoluteCommonDir = isAbsolute(commonDir)
      ? commonDir
      : resolve(toplevel, commonDir);

    // Step 4: The Git common-dir product root is the parent of the common .git directory
    const gitCommonDirProductRoot = dirname(absoluteCommonDir);

    return {
      productDir: gitCommonDirProductRoot,
      isGitRepo: true,
    };
  } catch {
    return {
      productDir: cwd,
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
 * If `sessionsDir` is provided, uses it directly. Otherwise, detects the Git
 * common-dir product root via `detectGitCommonDirProductRoot` and builds absolute paths from
 * `DEFAULT_CONFIG`.
 *
 * Session operations resolve against the Git common-dir product root so that
 * `.spx/sessions/` is shared across all worktrees.
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

/**
 * Builds an absolute session file path from product directory and session ID.
 *
 * Pure function that constructs the path without I/O.
 * All path components come from the config parameter (single source of truth).
 *
 * @param productDir - Absolute path to product directory
 * @param sessionId - Session timestamp ID (e.g., "2026-01-13_08-01-05")
 * @param config - Session directory configuration
 * @returns Absolute path to session file in todo directory
 *
 * @example
 * ```typescript
 * const path = buildSessionPathFromProductDir(
 *   '/Users/dev/myproject',
 *   '2026-01-13_08-01-05',
 *   DEFAULT_SESSION_CONFIG,
 * );
 * // => '/Users/dev/myproject/.spx/sessions/todo/2026-01-13_08-01-05.md'
 * ```
 */
export function buildSessionPathFromProductDir(
  productDir: string,
  sessionId: string,
  config: SessionDirectoryConfig,
): string {
  const filename = `${sessionId}.md`;

  // Build absolute path: product directory + todo dir + filename
  // All components come from config (no hardcoded strings)
  return join(productDir, config.todoDir, filename);
}
