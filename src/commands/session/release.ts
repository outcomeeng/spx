/**
 * Session release CLI command handler.
 *
 * @module commands/session/release
 */

import { readdir, rename } from "node:fs/promises";

import { resolveSessionConfig } from "../../git/root.js";
import { SessionNotClaimedError } from "../../session/errors.js";
import { buildReleasePaths, findCurrentSession } from "../../session/release.js";
import type { SessionDirectoryConfig } from "../../session/show.js";

/**
 * Options for the release command.
 */
export interface ReleaseOptions {
  /** Session ID to release (optional, defaults to most recent in doing) */
  sessionId?: string;
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Loads session refs from the doing directory.
 */
async function loadDoingSessions(config: SessionDirectoryConfig): Promise<Array<{ id: string }>> {
  try {
    const files = await readdir(config.doingDir);
    return files
      .filter((file) => file.endsWith(".md"))
      .map((file) => ({ id: file.replace(".md", "") }));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Executes the release command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {SessionNotClaimedError} When session not in doing directory
 */
export async function releaseCommand(options: ReleaseOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  let sessionId: string;

  if (options.sessionId) {
    sessionId = options.sessionId;
  } else {
    // Find most recent session in doing
    const sessions = await loadDoingSessions(config);
    const current = findCurrentSession(sessions);

    if (!current) {
      throw new SessionNotClaimedError("(none)");
    }

    sessionId = current.id;
  }

  // Build paths and perform release
  const paths = buildReleasePaths(sessionId, config);

  try {
    await rename(paths.source, paths.target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new SessionNotClaimedError(sessionId);
    }
    throw error;
  }

  return `Released session: ${sessionId}\nSession returned to todo directory.`;
}
