/**
 * Session type definitions for the session management domain.
 *
 * @module session/types
 */

/**
 * Priority levels for session ordering.
 * Sessions are sorted: high → medium → low
 */
export const SESSION_PRIORITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type SessionPriority = (typeof SESSION_PRIORITY)[keyof typeof SESSION_PRIORITY];

/**
 * All valid session statuses, derived from directory structure.
 * This is the single source of truth — SessionStatus type derives from it.
 */
export const SESSION_STATUSES = ["todo", "doing", "archive"] as const;

/**
 * Status derived from directory location.
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
  [SESSION_PRIORITY.HIGH]: 0,
  [SESSION_PRIORITY.MEDIUM]: 1,
  [SESSION_PRIORITY.LOW]: 2,
} as const;

/**
 * Default priority when not specified in YAML front matter.
 */
export const DEFAULT_PRIORITY: SessionPriority = SESSION_PRIORITY.MEDIUM;

/**
 * YAML front matter keys for session files.
 * Single source of truth for the serialized session schema.
 */
export const SESSION_FRONT_MATTER = {
  PRIORITY: "priority",
  ID: "id",
  BRANCH: "branch",
  WORKTREE: "worktree",
  GOAL: "goal",
  NEXT_STEP: "next_step",
  RESULT: "result",
  CREATED_AT: "created_at",
  AGENT_SESSION_ID: "agent_session_id",
  SPECS: "specs",
  FILES: "files",
} as const;

/**
 * Frontmatter keys a canonical session must carry. A session whose frontmatter
 * omits any of these — or carries a key outside SESSION_FRONT_MATTER — is
 * non-canonical, and archive admits it without a result requirement.
 */
export const CANONICAL_REQUIRED_KEYS = [
  SESSION_FRONT_MATTER.PRIORITY,
  SESSION_FRONT_MATTER.BRANCH,
  SESSION_FRONT_MATTER.WORKTREE,
  SESSION_FRONT_MATTER.GOAL,
  SESSION_FRONT_MATTER.NEXT_STEP,
] as const;

/**
 * Metadata extracted from session YAML front matter.
 */
export interface SessionMetadata {
  /** Session ID (from filename or YAML) */
  id?: string;
  /** Priority level for sorting */
  priority: SessionPriority;
  /** Git branch associated with session */
  branch: string;
  /** Worktree path relative to Git common-dir parent */
  worktree: string;
  /** Handoff goal */
  goal: string;
  /** First action for the next agent */
  next_step: string;
  /** Result recorded before archive */
  result: string;
  /** Spec files to auto-inject on pickup */
  specs: string[];
  /** Code files to auto-inject on pickup */
  files: string[];
  /** ISO 8601 timestamp when session was created */
  created_at?: string;
  /** Agent session ID from CLAUDE_SESSION_ID or CODEX_THREAD_ID at handoff time */
  agent_session_id?: string;
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
