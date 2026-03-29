/**
 * Session list CLI command handler.
 *
 * @module commands/session/list
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveSessionConfig } from "../../git/root.js";
import { parseSessionMetadata, sortSessions } from "../../session/list.js";
import type { SessionDirectoryConfig } from "../../session/show.js";
import { DEFAULT_LIST_STATUSES, type Session, SESSION_STATUSES, type SessionStatus } from "../../session/types.js";

/**
 * Options for the list command.
 * Note: status is string (not SessionStatus) because it comes from user input via Commander.js.
 * Validation happens inside listCommand per ADR 001-cli-framework.
 */
export interface ListOptions {
  /** Filter by status (validated against SESSION_STATUSES) */
  status?: string;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Output format */
  format?: "text" | "json";
}

/**
 * Loads sessions from a specific directory.
 */
async function loadSessionsFromDir(
  dir: string,
  status: SessionStatus,
): Promise<Session[]> {
  try {
    const files = await readdir(dir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const id = file.replace(".md", "");
      const filePath = join(dir, file);
      const content = await readFile(filePath, "utf-8");
      const metadata = parseSessionMetadata(content);

      sessions.push({
        id,
        status,
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
 * Maps a session status to its directory path in the config.
 */
const STATUS_DIR_KEY: Record<SessionStatus, keyof SessionDirectoryConfig> = {
  todo: "todoDir",
  doing: "doingDir",
  archive: "archiveDir",
};

/**
 * Formats sessions for text output.
 */
function formatTextOutput(sessions: Session[]): string {
  if (sessions.length === 0) {
    return `  (no sessions)`;
  }

  return sessions
    .map((s) => {
      const priority = s.metadata.priority !== "medium" ? ` [${s.metadata.priority}]` : "";
      const tags = s.metadata.tags.length > 0 ? ` (${s.metadata.tags.join(", ")})` : "";
      return `  ${s.id}${priority}${tags}`;
    })
    .join("\n");
}

/**
 * Executes the list command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 */
/**
 * Validates a user-supplied status string against SESSION_STATUSES.
 * Returns the validated SessionStatus or throws with valid values listed.
 */
function validateStatus(input: string): SessionStatus {
  if (SESSION_STATUSES.includes(input as SessionStatus)) {
    return input as SessionStatus;
  }
  throw new Error(
    `Invalid status: "${input}". Valid values: ${SESSION_STATUSES.join(", ")}`,
  );
}

export async function listCommand(options: ListOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Validate and resolve statuses per ADR 001-cli-framework
  const statuses: readonly SessionStatus[] = options.status !== undefined
    ? [validateStatus(options.status)]
    : DEFAULT_LIST_STATUSES;

  const sessionsByStatus: Partial<Record<SessionStatus, Session[]>> = {};

  for (const status of statuses) {
    const dirKey = STATUS_DIR_KEY[status];
    const sessions = await loadSessionsFromDir(config[dirKey], status);
    sessionsByStatus[status] = sortSessions(sessions);
  }

  // Format output
  if (options.format === "json") {
    return JSON.stringify(sessionsByStatus, null, 2);
  }

  // Text format
  const lines: string[] = [];

  for (const status of statuses) {
    lines.push(`${status.toUpperCase()}:`);
    lines.push(formatTextOutput(sessionsByStatus[status] ?? []));
    lines.push("");
  }

  return lines.join("\n").trim();
}
