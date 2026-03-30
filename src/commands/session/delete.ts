/**
 * Session delete CLI command handler.
 *
 * @module commands/session/delete
 */

import { stat, unlink } from "node:fs/promises";

import { resolveSessionConfig } from "../../git/root.js";
import { processBatch } from "../../session/batch.js";
import { resolveDeletePath } from "../../session/delete.js";
import { resolveSessionPaths, type SessionDirectoryConfig } from "../../session/show.js";

/**
 * Options for the delete command.
 */
export interface DeleteOptions {
  /** Session ID(s) to delete */
  sessionIds: string[];
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Checks which paths exist.
 */
async function findExistingPaths(paths: string[]): Promise<string[]> {
  const existing: string[] = [];

  for (const path of paths) {
    try {
      const stats = await stat(path);
      if (stats.isFile()) {
        existing.push(path);
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return existing;
}

/**
 * Executes the delete command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {SessionNotFoundError} When session not found
 */
/**
 * Deletes a single session by ID.
 */
async function deleteSingle(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<string> {
  const paths = resolveSessionPaths(sessionId, config);
  const existingPaths = await findExistingPaths(paths);
  const pathToDelete = resolveDeletePath(sessionId, existingPaths);
  await unlink(pathToDelete);
  return `Deleted session: ${sessionId}`;
}

/**
 * Executes the delete command for one or more session IDs.
 *
 * @param options - Command options with one or more session IDs
 * @returns Formatted output for display
 * @throws {BatchError} When one or more IDs fail
 * @throws {SessionNotFoundError} When session not found (single ID)
 */
export async function deleteCommand(options: DeleteOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  return processBatch(options.sessionIds, (id) => deleteSingle(id, config));
}
