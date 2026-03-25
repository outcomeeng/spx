/**
 * Session list CLI command handler.
 *
 * @module commands/session/list
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveSessionConfig } from "../../git/root.js";
import { parseSessionMetadata, sortSessions } from "../../session/list.js";
import type { Session, SessionStatus } from "../../session/types.js";

/**
 * Options for the list command.
 */
export interface ListOptions {
  /** Filter by status */
  status?: SessionStatus;
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
 * Formats sessions for text output.
 */
function formatTextOutput(sessions: Session[], _status: SessionStatus): string {
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
export async function listCommand(options: ListOptions): Promise<string> {
  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Load sessions based on filter
  const statuses: SessionStatus[] = options.status
    ? [options.status]
    : ["todo", "doing", "archive"];

  const allSessions: Record<SessionStatus, Session[]> = {
    todo: [],
    doing: [],
    archive: [],
  };

  for (const status of statuses) {
    const dir = status === "todo"
      ? config.todoDir
      : status === "doing"
      ? config.doingDir
      : config.archiveDir;

    const sessions = await loadSessionsFromDir(dir, status);
    allSessions[status] = sortSessions(sessions);
  }

  // Format output
  if (options.format === "json") {
    return JSON.stringify(allSessions, null, 2);
  }

  // Text format
  const lines: string[] = [];

  if (statuses.includes("doing")) {
    lines.push("DOING:");
    lines.push(formatTextOutput(allSessions.doing, "doing"));
    lines.push("");
  }

  if (statuses.includes("todo")) {
    lines.push("TODO:");
    lines.push(formatTextOutput(allSessions.todo, "todo"));
    lines.push("");
  }

  if (statuses.includes("archive")) {
    lines.push("ARCHIVE:");
    lines.push(formatTextOutput(allSessions.archive, "archive"));
  }

  return lines.join("\n").trim();
}
