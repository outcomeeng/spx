/**
 * Session pickup CLI command handler.
 *
 * @module commands/session/pickup
 */

import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { processBatch } from "@/domains/session/batch";
import { NoSessionsAvailableError } from "@/domains/session/errors";
import { parseSessionMetadata } from "@/domains/session/list";
import { buildClaimPaths, classifyClaimError, selectBestSession } from "@/domains/session/pickup";
import { formatShowOutput, SessionDirectoryConfig } from "@/domains/session/show";
import {
  CLAIMABLE_STATUS,
  formatSessionOutputMarker,
  Session,
  SESSION_FILE_ENCODING,
  SESSION_FILE_ERROR_CODE,
  SESSION_OUTPUT_MARKER,
  SESSION_STATUSES,
  SessionStatus,
} from "@/domains/session/types";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

/** Status of sessions after being claimed. */
const PICKUP_TARGET_STATUS: SessionStatus = SESSION_STATUSES[1]; // doing

/**
 * Options for the pickup command.
 */
export interface PickupOptions {
  /** Session IDs to pickup. Empty array is valid only with auto. */
  sessionIds: readonly string[];
  /** Auto-select highest priority session */
  auto?: boolean;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
}

/**
 * Loads sessions from the claimable-session directory.
 */
export async function loadTodoSessions(config: SessionDirectoryConfig): Promise<Session[]> {
  try {
    const files = await readdir(config.todoDir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const id = file.replace(".md", "");
      const filePath = join(config.todoDir, file);
      const content = await readFile(filePath, SESSION_FILE_ENCODING);
      const metadata = parseSessionMetadata(content);

      sessions.push({
        id,
        status: CLAIMABLE_STATUS,
        path: filePath,
        metadata,
      });
    }

    return sessions;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === SESSION_FILE_ERROR_CODE.NOT_FOUND) {
      return [];
    }
    throw error;
  }
}

/**
 * Claims one session from the claimable queue and moves it to doing.
 */
async function pickupSingle(sessionId: string, config: SessionDirectoryConfig): Promise<string> {
  const paths = buildClaimPaths(sessionId, config);
  await mkdir(config.doingDir, { recursive: true });

  try {
    await rename(paths.source, paths.target);
  } catch (error) {
    throw classifyClaimError(error, sessionId);
  }

  const content = await readFile(paths.target, SESSION_FILE_ENCODING);
  const output = formatShowOutput(content, { status: PICKUP_TARGET_STATUS });

  return `Claimed session ${formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, sessionId)}\n\n${output}`;
}

/**
 * Executes the pickup command.
 *
 * Claims one or more sessions from the claimable queue and moves them to doing.
 * Output includes one `<PICKUP_ID>` tag per claimed session for automation.
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session IDs
 * @throws {NoSessionsAvailableError} When no sessions are available for auto mode
 * @throws {SessionNotAvailableError} When one or more sessions cannot be claimed
 * @throws {BatchError} When one or more explicit IDs fail
 */
export async function pickupCommand(options: PickupOptions): Promise<string> {
  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning);

  if (options.auto) {
    if (options.sessionIds.length > 0) {
      throw new Error("Session IDs cannot be combined with --auto");
    }

    const sessions = await loadTodoSessions(config);
    const selected = selectBestSession(sessions);

    if (!selected) {
      throw new NoSessionsAvailableError();
    }

    return pickupSingle(selected.id, config);
  }

  if (options.sessionIds.length === 0) {
    throw new Error("Either session ID or --auto flag is required");
  }

  if (options.sessionIds.length === 1) {
    return pickupSingle(options.sessionIds[0], config);
  }

  return processBatch(options.sessionIds, (id) => pickupSingle(id, config));
}
