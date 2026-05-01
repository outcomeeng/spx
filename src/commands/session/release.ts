/**
 * Session release CLI command handler.
 *
 * @module commands/session/release
 */

import { readdir, rename } from "node:fs/promises";

import { resolveSessionConfig } from "@/git/root";
import { processBatch } from "@/session/batch";
import { SessionNotClaimedError } from "@/session/errors";
import { buildReleasePaths, findCurrentSession } from "@/session/release";
import type { SessionDirectoryConfig } from "@/session/show";

export const SESSION_RELEASE_OUTPUT = {
  RELEASED: "Released session",
  RETURNED_TO_TODO: "Session returned to todo directory.",
} as const;

/**
 * Options for the release command.
 */
export interface ReleaseOptions {
  /** Session IDs to release. Empty array defaults to most recent in doing. */
  sessionIds: string[];
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
 * Releases a single claimed session by ID.
 */
async function releaseSingle(sessionId: string, config: SessionDirectoryConfig): Promise<string> {
  const paths = buildReleasePaths(sessionId, config);

  try {
    await rename(paths.source, paths.target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new SessionNotClaimedError(sessionId);
    }
    throw error;
  }

  return `${SESSION_RELEASE_OUTPUT.RELEASED}: ${sessionId}\n${SESSION_RELEASE_OUTPUT.RETURNED_TO_TODO}`;
}

/**
 * Executes the release command for zero or more session IDs.
 *
 * When `sessionIds` is empty, the most recently claimed session in doing is released.
 * When one or more IDs are provided, all are processed in argument order.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {BatchError} When one or more IDs fail
 * @throws {SessionNotClaimedError} When no session is claimed (empty IDs) or session not in doing (single ID)
 */
export async function releaseCommand(options: ReleaseOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  let ids = options.sessionIds;

  if (ids.length === 0) {
    const sessions = await loadDoingSessions(config);
    const current = findCurrentSession(sessions);

    if (!current) {
      throw new SessionNotClaimedError("(none)");
    }

    ids = [current.id];
  }

  return processBatch(ids, (id) => releaseSingle(id, config));
}
