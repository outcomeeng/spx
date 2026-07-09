/**
 * Session directory configuration resolution.
 *
 * Resolves session paths from the shared `.spx/sessions` scope the state module
 * provides, composing the status subdirectories from config, and surfaces the
 * non-git-repo diagnostic for a descriptor to write to stderr.
 *
 * @module commands/session/resolve-config
 */

import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { SessionDirectoryConfig } from "@/domains/session/show";
import { type GitDependencies } from "@/lib/git/root";
import { resolveSessionsScopeDir } from "@/lib/state-store";

/** Options for resolving session directory configuration. */
export interface ResolveSessionConfigOptions {
  /** Explicit sessions directory (overrides auto-detection). */
  sessionsDir?: string;
  /** Current working directory for git detection. */
  cwd?: string;
  /** Injectable git dependencies for testing. */
  deps?: GitDependencies;
}

/** Result of session config resolution. */
export interface ResolveSessionConfigResult {
  /** Resolved session directory configuration with absolute paths. */
  config: SessionDirectoryConfig;
  /** Warning message if not in a git repository. */
  warning?: string;
}

/**
 * Resolves session directory configuration. With an explicit `sessionsDir` the
 * provided directory is used and git detection is skipped; otherwise the shared
 * `.spx/sessions` scope is resolved through the state module's
 * {@link resolveSessionsScopeDir}. The status subdirectories are composed from
 * `DEFAULT_CONFIG.sessions.statusDirs`.
 */
export async function resolveSessionConfig(
  options: ResolveSessionConfigOptions = {},
): Promise<ResolveSessionConfigResult> {
  const { sessionsDir, cwd, deps } = options;
  const { statusDirs } = DEFAULT_CONFIG.sessions;

  if (sessionsDir) {
    return {
      config: {
        todoDir: join(sessionsDir, statusDirs.todo),
        doingDir: join(sessionsDir, statusDirs.doing),
        archiveDir: join(sessionsDir, statusDirs.archive),
      },
    };
  }

  const { sessionsDir: baseDir, warning } = await resolveSessionsScopeDir({ cwd, deps });
  return {
    config: {
      todoDir: join(baseDir, statusDirs.todo),
      doingDir: join(baseDir, statusDirs.doing),
      archiveDir: join(baseDir, statusDirs.archive),
    },
    warning,
  };
}

/** Receives the non-git-repo diagnostic for a descriptor to write to stderr. */
export type SessionWarningHandler = (warning: string) => void;

/**
 * Resolves the session directory configuration, forwarding the non-git-repo
 * diagnostic that resolution emits — when the working directory is outside a git
 * repository and session storage falls back to it — to `onWarning` so the
 * descriptor can surface it. Mirrors the spec commands' `onWarning` contract.
 *
 * @param sessionsDir - Explicit sessions directory, or undefined to auto-detect.
 * @param onWarning - Receives the diagnostic when config falls back outside a git repository.
 * @returns The resolved session directory configuration.
 */
export async function resolveSessionConfigSurfacingWarning(
  sessionsDir: string | undefined,
  onWarning?: SessionWarningHandler,
  cwd?: string,
): Promise<SessionDirectoryConfig> {
  const { config, warning } = await resolveSessionConfig({ sessionsDir, cwd });
  if (warning !== undefined) {
    onWarning?.(warning);
  }
  return config;
}
