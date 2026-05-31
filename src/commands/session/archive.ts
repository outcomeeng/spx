/**
 * Session archive CLI command handler.
 *
 * @module commands/session/archive
 */

import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  buildArchivePaths,
  ExistingPathsMap,
  findSessionForArchive,
  SESSION_FILE_EXTENSION,
} from "@/domains/session/archive";
import { processBatch } from "@/domains/session/batch";
import { parseCanonicalSession } from "@/domains/session/canonical";
import { SessionInvalidResultError, SessionNotCanonicalError, SessionNotFoundError } from "@/domains/session/errors";
import { SessionDirectoryConfig } from "@/domains/session/show";
import { type SessionMetadata } from "@/domains/session/types";
import { resolveSessionConfig } from "@/git/root";

export const SESSION_ARCHIVE_OUTPUT = {
  ARCHIVED: "Archived session",
  ARCHIVE_LOCATION: "Archive location",
} as const;

/**
 * Options for the archive command.
 */
export interface ArchiveOptions {
  /** Session ID(s) to archive */
  sessionIds: string[];
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
 * Checks whether a path exists as a file.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Builds an ExistingPathsMap by probing the filesystem for a session ID
 * across all status directories.
 *
 * @param sessionId - Session ID to locate
 * @param config - Directory configuration
 * @returns Map of existing paths (null for directories where file is absent)
 */
async function probeSessionPaths(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<ExistingPathsMap> {
  const filename = `${sessionId}${SESSION_FILE_EXTENSION}`;
  const todoPath = join(config.todoDir, filename);
  const doingPath = join(config.doingDir, filename);
  const archivePath = join(config.archiveDir, filename);

  return {
    todo: await fileExists(todoPath) ? todoPath : null,
    doing: await fileExists(doingPath) ? doingPath : null,
    archive: await fileExists(archivePath) ? archivePath : null,
  };
}

/**
 * Resolves source and target paths for archiving a session.
 *
 * @param sessionId - Session ID to archive
 * @param config - Directory configuration
 * @returns Source and target paths for the archive rename
 * @throws {SessionNotFoundError} When session is not found in todo or doing
 * @throws {SessionAlreadyArchivedError} When session is already in archive
 */
export async function resolveArchivePaths(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<{ source: string; target: string }> {
  const existingPaths = await probeSessionPaths(sessionId, config);

  if (existingPaths.archive !== null) {
    throw new SessionAlreadyArchivedError(sessionId);
  }

  const location = findSessionForArchive(existingPaths);

  if (!location) {
    throw new SessionNotFoundError(sessionId);
  }

  const paths = buildArchivePaths(sessionId, location.status, config);
  return paths;
}

/**
 * Classifies a session's content against the canonical frontmatter shape.
 *
 * @param content - Full session file content
 * @returns Canonical metadata when the frontmatter conforms, or null when the
 *   session is non-canonical
 */
function classifyCanonicalSession(content: string): SessionMetadata | null {
  try {
    return parseCanonicalSession(content);
  } catch (error) {
    if (error instanceof SessionNotCanonicalError) {
      return null;
    }
    throw error;
  }
}

/**
 * Archives a single session by ID.
 */
async function archiveSingle(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<string> {
  const { source, target } = await resolveArchivePaths(sessionId, config);
  const content = await readFile(source, "utf-8");

  // A canonical session must carry a non-empty result before archive. A
  // non-canonical session predates that contract, so it is archived as-is.
  const canonicalMetadata = classifyCanonicalSession(content);
  if (canonicalMetadata !== null && canonicalMetadata.result.trim().length === 0) {
    throw new SessionInvalidResultError(sessionId);
  }

  await mkdir(dirname(target), { recursive: true });
  await rename(source, target);
  return `${SESSION_ARCHIVE_OUTPUT.ARCHIVED}: ${sessionId}\n${SESSION_ARCHIVE_OUTPUT.ARCHIVE_LOCATION}: ${target}`;
}

/**
 * Executes the archive command for one or more session IDs.
 *
 * @param options - Command options with one or more session IDs
 * @returns Formatted output for display
 * @throws {BatchError} When one or more IDs fail
 * @throws {SessionNotFoundError} When session not found (single ID)
 * @throws {SessionAlreadyArchivedError} When session already archived (single ID)
 */
export async function archiveCommand(options: ArchiveOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  return processBatch(options.sessionIds, (id) => archiveSingle(id, config));
}
