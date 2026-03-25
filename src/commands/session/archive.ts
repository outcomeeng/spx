/**
 * Session archive CLI command handler.
 *
 * @module commands/session/archive
 */

import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveSessionConfig } from "../../git/root.js";
import { SessionNotFoundError } from "../../session/errors.js";
import type { SessionDirectoryConfig } from "../../session/show.js";

/**
 * Options for the archive command.
 */
export interface ArchiveOptions {
  /** Session ID to archive */
  sessionId: string;
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Error thrown when a session is already archived.
 */
export class SessionAlreadyArchivedError extends Error {
  /** The session ID that is already archived */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session already archived: ${sessionId}.`);
    this.name = "SessionAlreadyArchivedError";
    this.sessionId = sessionId;
  }
}

/**
 * Finds the source path for a session to archive.
 *
 * @param sessionId - Session ID to find
 * @param config - Directory configuration
 * @returns Source path and target path for archiving
 * @throws {SessionNotFoundError} When session is not found in todo or doing
 * @throws {SessionAlreadyArchivedError} When session is already in archive
 */
export async function resolveArchivePaths(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<{ source: string; target: string }> {
  const filename = `${sessionId}.md`;
  const todoPath = join(config.todoDir, filename);
  const doingPath = join(config.doingDir, filename);
  const archivePath = join(config.archiveDir, filename);

  // Check if already archived
  try {
    const archiveStats = await stat(archivePath);
    if (archiveStats.isFile()) {
      throw new SessionAlreadyArchivedError(sessionId);
    }
  } catch (error) {
    // ENOENT is expected - session not in archive
    if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
    // Rethrow SessionAlreadyArchivedError
    if (error instanceof SessionAlreadyArchivedError) {
      throw error;
    }
  }

  // Check todo directory first
  try {
    const todoStats = await stat(todoPath);
    if (todoStats.isFile()) {
      return { source: todoPath, target: archivePath };
    }
  } catch {
    // File not in todo, continue to check doing
  }

  // Check doing directory
  try {
    const doingStats = await stat(doingPath);
    if (doingStats.isFile()) {
      return { source: doingPath, target: archivePath };
    }
  } catch {
    // File not in doing either
  }

  // Session not found in either directory
  throw new SessionNotFoundError(sessionId);
}

/**
 * Executes the archive command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {SessionNotFoundError} When session not found
 * @throws {SessionAlreadyArchivedError} When session is already archived
 */
export async function archiveCommand(options: ArchiveOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Resolve source and target paths
  const { source, target } = await resolveArchivePaths(options.sessionId, config);

  // Ensure archive directory exists (FR2: create if missing)
  await mkdir(dirname(target), { recursive: true });

  // Move to archive
  await rename(source, target);

  return `Archived session: ${options.sessionId}\nArchive location: ${target}`;
}
