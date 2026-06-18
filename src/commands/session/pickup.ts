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
import { Session, SESSION_STATUSES, SessionStatus } from "@/domains/session/types";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

/** Status of sessions available for pickup. */
const PICKUP_SOURCE_STATUS: SessionStatus = SESSION_STATUSES[0]; // todo
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
 * Loads sessions from the todo directory.
 */
export async function loadTodoSessions(config: SessionDirectoryConfig): Promise<Session[]> {
  try {
    const files = await readdir(config.todoDir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const id = file.replace(".md", "");
      const filePath = join(config.todoDir, file);
      const content = await readFile(filePath, "utf-8");
      const metadata = parseSessionMetadata(content);

      sessions.push({
        id,
        status: PICKUP_SOURCE_STATUS,
        path: filePath,
        metadata,
      });
    }

    return sessions;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Claims one session from the todo queue and moves it to doing.
 */
async function pickupSingle(sessionId: string, config: SessionDirectoryConfig): Promise<string> {
  const paths = buildClaimPaths(sessionId, config);
  await mkdir(config.doingDir, { recursive: true });

  try {
    await rename(paths.source, paths.target);
  } catch (error) {
    throw classifyClaimError(error, sessionId);
  }

  const content = await readFile(paths.target, "utf-8");
  const output = formatShowOutput(content, { status: PICKUP_TARGET_STATUS });

  return `Claimed session <PICKUP_ID>${sessionId}</PICKUP_ID>\n\n${output}`;
}

/**
 * Executes the pickup command.
 *
 * Claims one or more sessions from the todo queue and moves them to doing.
 * Output includes one `<PICKUP_ID>` tag per claimed session for automation.
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session IDs
 * @throws {NoSessionsAvailableError} When no sessions in todo for auto mode
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
