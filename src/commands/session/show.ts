/**
 * Session show CLI command handler.
 *
 * @module commands/session/show
 */

import { readFile, stat } from "node:fs/promises";

import { resolveSessionConfig } from "../../git/root.js";
import { SessionNotFoundError } from "../../session/errors.js";
import {
  formatShowOutput,
  resolveSessionPaths,
  SEARCH_ORDER,
  type SessionDirectoryConfig,
} from "../../session/show.js";
import type { SessionStatus } from "../../session/types.js";

/**
 * Options for the show command.
 */
export interface ShowOptions {
  /** Session ID to show */
  sessionId: string;
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Finds the first existing path and its status.
 */
async function findExistingPath(
  paths: string[],
  _config: SessionDirectoryConfig,
): Promise<{ path: string; status: SessionStatus } | null> {
  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        return { path: filePath, status: SEARCH_ORDER[i] };
      }
    } catch {
      // File doesn't exist, continue
    }
  }
  return null;
}

/**
 * Executes the show command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {SessionNotFoundError} When session not found
 */
export async function showCommand(options: ShowOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Resolve possible paths
  const paths = resolveSessionPaths(options.sessionId, config);

  // Find the existing file
  const found = await findExistingPath(paths, config);

  if (!found) {
    throw new SessionNotFoundError(options.sessionId);
  }

  // Read and format content
  const content = await readFile(found.path, "utf-8");
  return formatShowOutput(content, { status: found.status });
}
