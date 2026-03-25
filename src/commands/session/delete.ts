/**
 * Session delete CLI command handler.
 *
 * @module commands/session/delete
 */

import { stat, unlink } from "node:fs/promises";

import { resolveSessionConfig } from "../../git/root.js";
import { resolveDeletePath } from "../../session/delete.js";
import { resolveSessionPaths } from "../../session/show.js";

/**
 * Options for the delete command.
 */
export interface DeleteOptions {
  /** Session ID to delete */
  sessionId: string;
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
export async function deleteCommand(options: DeleteOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Resolve possible paths
  const paths = resolveSessionPaths(options.sessionId, config);

  // Find existing paths
  const existingPaths = await findExistingPaths(paths);

  // Resolve the path to delete
  const pathToDelete = resolveDeletePath(options.sessionId, existingPaths);

  // Delete the file
  await unlink(pathToDelete);

  return `Deleted session: ${options.sessionId}`;
}
