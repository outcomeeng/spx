/**
 * Session display utilities for showing session content without claiming.
 *
 * @module session/show
 */

import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { parseSessionMetadata } from "./list";
import { SESSION_STATUSES, type SessionStatus } from "./types";

export const SESSION_SHOW_LABEL = {
  STATUS: "Status",
  PRIORITY: "Priority",
  GIT_REF: "Git ref",
  GOAL: "Goal",
  NEXT_STEP: "Next step",
  CREATED: "Created",
  AGENT_SESSION: "Agent session",
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
 * The `.spx/sessions` base derives from the state module's path tokens, which own
 * the `.spx/` layout; the status-directory names derive from DEFAULT_CONFIG. NEVER
 * hardcode these path components - always derive them from their owning source.
 */
const sessionsBaseDir = join(STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE);
const { statusDirs } = DEFAULT_CONFIG.sessions;

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

/** Composes one `Label: value` line, where the label is the product's own and the reading is not. */
function metadataLine(label: string, value: string): TerminalText {
  return terminal`${authoredText(`${label}: `)}${externalValue(value)}`;
}

/**
 * Composes the session view: a metadata header the product writes about the session, followed by
 * the session file's own body. The labels and separator are product speech, while the frontmatter
 * readings and the file body are written by whoever authored the session, so they are escaped
 * where they are embedded. The whole view is one composed report rather than a relayed document —
 * the product wrapped the file in its own header, so it is speaking about the file, not reproducing it.
 *
 * @param content - Raw session file content
 * @param options - Display options including status
 * @returns Composed terminal text carrying the header and the body
 */
export function formatShowOutput(
  content: string,
  options: ShowOutputOptions,
): TerminalText {
  const metadata = parseSessionMetadata(content);

  const headerLines: TerminalText[] = [
    metadataLine(SESSION_SHOW_LABEL.STATUS, options.status),
    metadataLine(SESSION_SHOW_LABEL.PRIORITY, metadata.priority),
    metadataLine(SESSION_SHOW_LABEL.GIT_REF, metadata.git_ref),
    metadataLine(SESSION_SHOW_LABEL.GOAL, metadata.goal),
    metadataLine(SESSION_SHOW_LABEL.NEXT_STEP, metadata.next_step),
    metadataLine(SESSION_SHOW_LABEL.CREATED, metadata.created_at ?? ""),
    metadataLine(SESSION_SHOW_LABEL.AGENT_SESSION, metadata.agent_session_id ?? ""),
  ];

  const header = joinTerminalText("\n", headerLines);
  const separator = authoredText(
    "\n" + SESSION_SHOW_SEPARATOR_CHAR.repeat(SESSION_SHOW_SEPARATOR_WIDTH) + "\n\n",
  );

  return terminal`${header}${separator}${externalValue(content)}`;
}
