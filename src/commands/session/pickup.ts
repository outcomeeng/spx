/**
 * Session pickup CLI command handler.
 *
 * @module commands/session/pickup
 */

import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";

import { resolveSessionConfig } from "@/git/root";
import { NoSessionsAvailableError } from "@/session/errors";
import { parseSessionMetadata } from "@/session/list";
import { buildClaimPaths, classifyClaimError, selectBestSession } from "@/session/pickup";
import { formatShowOutput, type SessionDirectoryConfig } from "@/session/show";
import { type Session, SESSION_STATUSES, type SessionStatus } from "@/session/types";

/** Status of sessions available for pickup. */
const PICKUP_SOURCE_STATUS: SessionStatus = SESSION_STATUSES[0]; // todo
/** Status of sessions after being claimed. */
const PICKUP_TARGET_STATUS: SessionStatus = SESSION_STATUSES[1]; // doing

/**
 * Options for the pickup command.
 */
export interface PickupOptions {
  /** Session ID to pickup (mutually exclusive with auto) */
  sessionId?: string;
  /** Auto-select highest priority session */
  auto?: boolean;
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Loads sessions from the todo directory.
 */
async function loadTodoSessions(config: SessionDirectoryConfig): Promise<Session[]> {
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
 * Executes the pickup command.
 *
 * Claims a session from the todo queue and moves it to doing.
 * Output includes `<PICKUP_ID>` tag for easy parsing by automation tools.
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session ID
 * @throws {NoSessionsAvailableError} When no sessions in todo for auto mode
 * @throws {SessionNotAvailableError} When session already claimed
 */
export async function pickupCommand(options: PickupOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  let sessionId: string;

  if (options.auto) {
    // Auto mode: select best session
    const sessions = await loadTodoSessions(config);
    const selected = selectBestSession(sessions);

    if (!selected) {
      throw new NoSessionsAvailableError();
    }

    sessionId = selected.id;
  } else if (options.sessionId) {
    sessionId = options.sessionId;
  } else {
    throw new Error("Either session ID or --auto flag is required");
  }

  // Build paths and ensure doing directory exists
  const paths = buildClaimPaths(sessionId, config);
  await mkdir(config.doingDir, { recursive: true });

  // Perform atomic claim
  try {
    await rename(paths.source, paths.target);
  } catch (error) {
    throw classifyClaimError(error, sessionId);
  }

  // Read and format content
  const content = await readFile(paths.target, "utf-8");
  const output = formatShowOutput(content, { status: PICKUP_TARGET_STATUS });

  // Output with parseable PICKUP_ID tag
  return `Claimed session <PICKUP_ID>${sessionId}</PICKUP_ID>\n\n${output}`;
}
