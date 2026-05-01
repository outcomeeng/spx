/**
 * Session display utilities for showing session content without claiming.
 *
 * @module session/show
 */

import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { parseSessionMetadata } from "./list";
import { SESSION_STATUSES, type SessionStatus } from "./types";

export const SESSION_SHOW_LABEL = {
  ID: "ID",
  STATUS: "Status",
  PRIORITY: "Priority",
  BRANCH: "Branch",
  TAGS: "Tags",
  CREATED: "Created",
} as const;

export const SESSION_SHOW_SEPARATOR_CHAR = "─";
export const SESSION_SHOW_SEPARATOR_WIDTH = 40;

/**
 * Configuration for session directory paths.
 */
export interface SessionDirectoryConfig {
  /** Path to todo directory */
  todoDir: string;
  /** Path to doing directory */
  doingDir: string;
  /** Path to archive directory */
  archiveDir: string;
}

/**
 * Default session directory configuration.
 *
 * Derived from DEFAULT_CONFIG to ensure single source of truth for all path components.
 * NEVER hardcode path strings like ".spx", "sessions", "todo" - always derive from config.
 */
const { dir: sessionsBaseDir, statusDirs } = DEFAULT_CONFIG.sessions;

export const DEFAULT_SESSION_CONFIG: SessionDirectoryConfig = {
  todoDir: join(sessionsBaseDir, statusDirs.todo),
  doingDir: join(sessionsBaseDir, statusDirs.doing),
  archiveDir: join(sessionsBaseDir, statusDirs.archive),
};

/**
 * Order to search directories (matches priority: todo first, then doing, then archive).
 * Derived from SESSION_STATUSES to maintain a single source of truth.
 */
export const SEARCH_ORDER: SessionStatus[] = [...SESSION_STATUSES];

/**
 * Options for formatting show output.
 */
export interface ShowOutputOptions {
  /** Current status of the session */
  status: SessionStatus;
}

/**
 * Resolves possible file paths for a session ID across all status directories.
 *
 * @param id - Session ID (timestamp format)
 * @param config - Directory configuration
 * @returns Array of possible file paths in search order
 *
 * @example
 * ```typescript
 * const paths = resolveSessionPaths('2026-01-13_08-01-05', {
 *   todoDir: '.spx/sessions/todo',
 *   doingDir: '.spx/sessions/doing',
 *   archiveDir: '.spx/sessions/archive',
 * });
 * // => [
 * //   '.spx/sessions/todo/2026-01-13_08-01-05.md',
 * //   '.spx/sessions/doing/2026-01-13_08-01-05.md',
 * //   '.spx/sessions/archive/2026-01-13_08-01-05.md',
 * // ]
 * ```
 */
export function resolveSessionPaths(
  id: string,
  config: SessionDirectoryConfig = DEFAULT_SESSION_CONFIG,
): string[] {
  const filename = `${id}.md`;

  return [
    `${config.todoDir}/${filename}`,
    `${config.doingDir}/${filename}`,
    `${config.archiveDir}/${filename}`,
  ];
}

/**
 * Formats session content for display with metadata header.
 *
 * @param content - Raw session file content
 * @param options - Display options including status
 * @returns Formatted output string with metadata header
 *
 * @example
 * ```typescript
 * const output = formatShowOutput(sessionContent, { status: 'todo' });
 * // => "Status: todo\nPriority: high\n---\n# Session Content..."
 * ```
 */
export function formatShowOutput(
  content: string,
  options: ShowOutputOptions,
): string {
  const metadata = parseSessionMetadata(content);

  // Build header with extracted metadata
  const headerLines: string[] = [
    `${SESSION_SHOW_LABEL.STATUS}: ${options.status}`,
    `${SESSION_SHOW_LABEL.PRIORITY}: ${metadata.priority}`,
  ];

  // Add optional metadata if present
  if (metadata.id) {
    headerLines.unshift(`${SESSION_SHOW_LABEL.ID}: ${metadata.id}`);
  }
  if (metadata.branch) {
    headerLines.push(`${SESSION_SHOW_LABEL.BRANCH}: ${metadata.branch}`);
  }
  if (metadata.tags.length > 0) {
    headerLines.push(`${SESSION_SHOW_LABEL.TAGS}: ${metadata.tags.join(", ")}`);
  }
  if (metadata.createdAt) {
    headerLines.push(`${SESSION_SHOW_LABEL.CREATED}: ${metadata.createdAt}`);
  }

  // Combine header with separator and original content
  const header = headerLines.join("\n");
  const separator = "\n" + SESSION_SHOW_SEPARATOR_CHAR.repeat(SESSION_SHOW_SEPARATOR_WIDTH) + "\n\n";

  return header + separator + content;
}
