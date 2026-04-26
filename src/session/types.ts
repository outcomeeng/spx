/**
 * Session type definitions for the session management domain.
 *
 * @module session/types
 */

/**
 * Priority levels for session ordering.
 * Sessions are sorted: high → medium → low
 */
export type SessionPriority = "high" | "medium" | "low";

/**
 * All valid session statuses, derived from directory structure per ADR-21.
 * This is the single source of truth — SessionStatus type derives from it.
 */
export const SESSION_STATUSES = ["todo", "doing", "archive"] as const;

/**
 * Status derived from directory location per ADR-21.
 */
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Default statuses shown by `spx session list` when no --status filter is provided.
 * Excludes archive — use `--status archive` to see archived sessions.
 */
export const DEFAULT_LIST_STATUSES: readonly SessionStatus[] = ["doing", "todo"] as const;

/**
 * Priority sort order (lower number = higher priority).
 */
export const PRIORITY_ORDER: Record<SessionPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
} as const;

/**
 * Default priority when not specified in YAML front matter.
 */
export const DEFAULT_PRIORITY: SessionPriority = "medium";

/**
 * YAML front matter keys for session files.
 * Single source of truth for the serialized session schema.
 */
export const SESSION_FRONT_MATTER = {
  PRIORITY: "priority",
  TAGS: "tags",
  ID: "id",
  BRANCH: "branch",
  CREATED_AT: "created_at",
  AGENT_SESSION_ID: "agent_session_id",
  WORKING_DIRECTORY: "working_directory",
  SPECS: "specs",
  FILES: "files",
} as const;

/**
 * Metadata extracted from session YAML front matter.
 */
export interface SessionMetadata {
  /** Session ID (from filename or YAML) */
  id?: string;
  /** Priority level for sorting */
  priority: SessionPriority;
  /** Free-form tags for filtering */
  tags: string[];
  /** Git branch associated with session */
  branch?: string;
  /** Spec files to auto-inject on pickup */
  specs?: string[];
  /** Code files to auto-inject on pickup */
  files?: string[];
  /** ISO 8601 timestamp when session was created */
  createdAt?: string;
  /** Agent session ID from CLAUDE_SESSION_ID or CODEX_THREAD_ID at handoff time */
  agentSessionId?: string;
  /** Working directory path */
  workingDirectory?: string;
}

/**
 * Complete session information including status and metadata.
 */
export interface Session {
  /** Session ID (timestamp format: YYYY-MM-DD_HH-mm-ss) */
  id: string;
  /** Status derived from directory location */
  status: SessionStatus;
  /** Metadata from YAML front matter */
  metadata: SessionMetadata;
  /** Full path to session file */
  path: string;
}
