/**
 * Git repository root detection utilities.
 *
 * Provides git root detection with dependency injection for testability.
 * Sessions should be created at the git repository root, not relative to cwd.
 *
 * @module git/root
 */

import { execa, type ResultPromise } from "execa";
import { join } from "node:path";

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
 * Dependencies for git operations (injectable for testing).
 */
export interface GitDependencies {
  /**
   * Execute a command (typically execa).
   *
   * @param command - Command to execute
   * @param args - Command arguments
   * @param options - Execution options
   * @returns Result promise with stdout/stderr
   */
  execa: (
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ) => ResultPromise;
}

/**
 * Default dependencies using real execa.
 */
const defaultDeps: GitDependencies = {
  execa: (command, args, options) => execa(command, args, options),
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
      // Trim whitespace and normalize path (remove trailing slashes)
      const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
      const gitRoot = stdout.trim().replace(/\/+$/, "");

      return {
        root: gitRoot,
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
