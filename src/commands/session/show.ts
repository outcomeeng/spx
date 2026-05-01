/**
 * Session show CLI command handler.
 *
 * @module commands/session/show
 */

import { readFile, stat } from "node:fs/promises";

import { processBatch } from "@/domains/session/batch";
import { SessionNotFoundError } from "@/domains/session/errors";
import { formatShowOutput, resolveSessionPaths, SEARCH_ORDER, SessionDirectoryConfig } from "@/domains/session/show";
import { SessionStatus } from "@/domains/session/types";
import { resolveSessionConfig } from "@/git/root";

/**
 * Options for the show command.
 */
export interface ShowOptions {
  /** Session ID(s) to show */
  sessionIds: string[];
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
/**
 * Shows a single session by ID.
 */
async function showSingle(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<string> {
  const paths = resolveSessionPaths(sessionId, config);
  const found = await findExistingPath(paths, config);

  if (!found) {
    throw new SessionNotFoundError(sessionId);
  }

  const content = await readFile(found.path, "utf-8");
  return formatShowOutput(content, { status: found.status });
}

/**
 * Executes the show command for one or more session IDs.
 *
 * @param options - Command options with one or more session IDs
 * @returns Formatted output for display
 * @throws {BatchError} When one or more IDs fail
 * @throws {SessionNotFoundError} When session not found (single ID)
 */
export async function showCommand(options: ShowOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  return processBatch(options.sessionIds, (id) => showSingle(id, config));
}
