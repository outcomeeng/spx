/**
 * Shared session-config resolution that surfaces the non-git-repo diagnostic.
 *
 * @module commands/session/resolve-config
 */

import { SessionDirectoryConfig } from "@/domains/session/show";
import { resolveSessionConfig } from "@/git/root";

/** Receives the non-git-repo diagnostic for a descriptor to write to stderr. */
export type SessionWarningHandler = (warning: string) => void;

/**
 * Resolves the session directory configuration, forwarding the non-git-repo
 * diagnostic that `resolveSessionConfig` emits — when the working directory is
 * outside a git repository and session storage falls back to it — to
 * `onWarning` so the descriptor can surface it. Mirrors the spec commands'
 * `onWarning` contract.
 *
 * @param sessionsDir - Explicit sessions directory, or undefined to auto-detect.
 * @param onWarning - Receives the diagnostic when config falls back outside a git repository.
 * @returns The resolved session directory configuration.
 */
export async function resolveSessionConfigSurfacingWarning(
  sessionsDir: string | undefined,
  onWarning?: SessionWarningHandler,
): Promise<SessionDirectoryConfig> {
  const { config, warning } = await resolveSessionConfig({ sessionsDir });
  if (warning !== undefined) {
    onWarning?.(warning);
  }
  return config;
}
