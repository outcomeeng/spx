/**
 * Session list CLI command handler.
 *
 * @module commands/session/list
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseSessionMetadata, sortSessions } from "@/domains/session/list";
import { SessionDirectoryConfig } from "@/domains/session/show";
import {
  DEFAULT_LIST_STATUSES,
  DEFAULT_PRIORITY,
  Session,
  SESSION_STATUSES,
  SessionStatus,
} from "@/domains/session/types";
import { resolveSessionConfig } from "@/git/root";

export const SESSION_LIST_FORMAT = {
  TEXT: "text",
  JSON: "json",
} as const;

export type SessionListFormat = (typeof SESSION_LIST_FORMAT)[keyof typeof SESSION_LIST_FORMAT];

export const SESSION_LIST_EMPTY_TEXT = "(no sessions)";

/**
 * Options for the list command.
 * Note: status is string (not SessionStatus) because it comes from user input via Commander.js.
 * Validation happens inside listCommand before status is used.
 */
export interface ListOptions {
  /** Filter by status (validated against SESSION_STATUSES) */
  status?: string;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Output format */
  format?: SessionListFormat;
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
    return `  ${SESSION_LIST_EMPTY_TEXT}`;
  }

  return sessions
    .map((s) => {
      const priority = s.metadata.priority !== DEFAULT_PRIORITY ? ` [${s.metadata.priority}]` : "";
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

  // Validate and resolve statuses before use.
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
  if (options.format === SESSION_LIST_FORMAT.JSON) {
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
