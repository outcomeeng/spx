/**
 * Session list CLI command handler.
 *
 * @module commands/session/list
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DEFAULT_LIST_WIDTH,
  formatSessionListText,
  formatStatusHeader,
  parseFieldSelection,
  parseSessionMetadata,
  projectSessionRecord,
  type SessionRecordField,
  sortSessions,
  toSessionRecord,
} from "@/domains/session/list";
import { SessionDirectoryConfig } from "@/domains/session/show";
import {
  DEFAULT_LIST_STATUSES,
  Session,
  SESSION_FILE_ENCODING,
  SESSION_FILE_ERROR_CODE,
  SESSION_STATUSES,
  SessionStatus,
} from "@/domains/session/types";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

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
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
  /** Output format */
  format?: SessionListFormat;
  /** Comma-separated field selection; implies JSON output. */
  fields?: string;
  /** Whether the text output is styled; resolved by the descriptor. Defaults to plain. */
  color?: boolean;
  /** Terminal width the text output truncates to; resolved by the descriptor. */
  width?: number;
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
      const content = await readFile(filePath, SESSION_FILE_ENCODING);
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
    if (error instanceof Error && "code" in error && error.code === SESSION_FILE_ERROR_CODE.NOT_FOUND) {
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
  // Parse the field selection first so an unknown field fails fast, before any
  // filesystem work. A field selection implies JSON output.
  const fieldSelection: SessionRecordField[] | undefined = options.fields !== undefined
    ? parseFieldSelection(options.fields)
    : undefined;

  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning);

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

  // Format output. A JSON format flag or a field selection emits JSON; each
  // session becomes a flat record (projected to the selected fields when given).
  const emitJson = fieldSelection !== undefined || options.format === SESSION_LIST_FORMAT.JSON;
  if (emitJson) {
    const recordsByStatus: Partial<Record<SessionStatus, unknown[]>> = {};
    for (const status of statuses) {
      recordsByStatus[status] = (sessionsByStatus[status] ?? []).map((session) => {
        const record = toSessionRecord(session);
        return fieldSelection !== undefined ? projectSessionRecord(record, fieldSelection) : record;
      });
    }
    return JSON.stringify(recordsByStatus, null, 2);
  }

  // Text format. The descriptor resolves the color decision and terminal width
  // as process I/O and passes them here; the formatter stays a pure function of
  // its inputs and never reads `process.stdout` or the environment.
  const color = options.color ?? false;
  const width = options.width ?? DEFAULT_LIST_WIDTH;
  const lines: string[] = [];

  for (const status of statuses) {
    const group = sessionsByStatus[status] ?? [];
    const body = group.length === 0 ? `  ${SESSION_LIST_EMPTY_TEXT}` : formatSessionListText(group, { color, width });
    lines.push(formatStatusHeader(status, color), body, "");
  }

  return lines.join("\n").trim();
}
