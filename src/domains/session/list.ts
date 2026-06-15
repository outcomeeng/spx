/**
 * Session listing and sorting utilities.
 *
 * @module session/list
 */

import { parse as parseYaml } from "yaml";

import { SessionInvalidFieldError } from "./errors";
import { parseSessionId } from "./timestamp";
import {
  DEFAULT_PRIORITY,
  PRIORITY_ORDER,
  type Session,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  type SessionMetadata,
  type SessionPriority,
  type SessionStatus,
} from "./types";

/**
 * Regular expression to match YAML front matter.
 * Matches content between opening `---` and closing `---` or `...`
 */
const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/;
const SESSION_PRIORITY_VALUES = Object.values(SESSION_PRIORITY);

export const DEFAULT_SESSION_METADATA: SessionMetadata = {
  priority: DEFAULT_PRIORITY,
  git_ref: "",
  goal: "",
  next_step: "",
  specs: [],
  files: [],
} as const;

function defaultSessionMetadata(): SessionMetadata {
  return {
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
  };
}

/**
 * Validates if a value is a valid priority.
 */
function isValidPriority(value: unknown): value is SessionPriority {
  return typeof value === "string" && SESSION_PRIORITY_VALUES.some((priority) => priority === value);
}

/**
 * Parses YAML front matter from session content to extract metadata.
 *
 * @param content - Full session file content
 * @returns Extracted metadata with defaults for missing fields
 *
 * @example
 * ```typescript
 * const metadata = parseSessionMetadata(`---
 * priority: high
 * goal: Fix failing checks
 * next_step: Run validation
 * ---
 * # Session content`);
 * // => { priority: 'high', goal: 'Fix failing checks', next_step: 'Run validation', ... }
 * ```
 */
export function parseSessionMetadata(content: string): SessionMetadata {
  const match = FRONT_MATTER_PATTERN.exec(content);

  if (!match) {
    return defaultSessionMetadata();
  }

  try {
    const parsed = parseYaml(match[1]) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      return defaultSessionMetadata();
    }

    const rawPriority = parsed[SESSION_FRONT_MATTER.PRIORITY];
    const priority = isValidPriority(rawPriority) ? rawPriority : DEFAULT_PRIORITY;

    const metadata: SessionMetadata = {
      ...defaultSessionMetadata(),
      priority,
    };

    const gitRef = parsed[SESSION_FRONT_MATTER.GIT_REF];
    metadata.git_ref = typeof gitRef === "string" ? gitRef : DEFAULT_SESSION_METADATA.git_ref;

    const goal = parsed[SESSION_FRONT_MATTER.GOAL];
    metadata.goal = typeof goal === "string" ? goal : DEFAULT_SESSION_METADATA.goal;

    const nextStep = parsed[SESSION_FRONT_MATTER.NEXT_STEP];
    metadata.next_step = typeof nextStep === "string" ? nextStep : DEFAULT_SESSION_METADATA.next_step;

    const createdAt = parsed[SESSION_FRONT_MATTER.CREATED_AT];
    if (typeof createdAt === "string") metadata.created_at = createdAt;

    const agentSessionId = parsed[SESSION_FRONT_MATTER.AGENT_SESSION_ID];
    if (typeof agentSessionId === "string") metadata.agent_session_id = agentSessionId;

    const specs = parsed[SESSION_FRONT_MATTER.SPECS];
    if (Array.isArray(specs)) {
      metadata.specs = specs.filter((s): s is string => typeof s === "string");
    }

    const files = parsed[SESSION_FRONT_MATTER.FILES];
    if (Array.isArray(files)) {
      metadata.files = files.filter((f): f is string => typeof f === "string");
    }

    return metadata;
  } catch {
    // Malformed YAML, return defaults
    return defaultSessionMetadata();
  }
}

/**
 * Sorts sessions by priority (high first) then by timestamp (newest first).
 *
 * @param sessions - Array of sessions to sort
 * @returns New sorted array (does not mutate input)
 *
 * @example
 * ```typescript
 * const sorted = sortSessions([
 *   { id: 'a', metadata: { priority: 'low' } },
 *   { id: 'b', metadata: { priority: 'high' } },
 * ]);
 * // => [{ id: 'b', ... }, { id: 'a', ... }]
 * ```
 */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    // First: sort by priority (high = 0, medium = 1, low = 2)
    const priorityA = PRIORITY_ORDER[a.metadata.priority];
    const priorityB = PRIORITY_ORDER[b.metadata.priority];

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Second: sort by timestamp (newest first = descending)
    const dateA = parseSessionId(a.id);
    const dateB = parseSessionId(b.id);

    // Handle invalid session IDs by treating them as oldest
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1; // a goes after b
    if (!dateB) return -1; // b goes after a

    return dateB.getTime() - dateA.getTime();
  });
}

/** Separator between field names in a `--fields` selection string. */
export const FIELD_SELECTION_SEPARATOR = ",";

/**
 * The projectable fields of a session record: `id` and `status` (the record-only
 * keys) plus every frontmatter key of `SESSION_FRONT_MATTER`. Each frontmatter
 * key is referenced from the registry so the selectable namespace stays tied to
 * one runtime source of truth. The order matches `toSessionRecord`'s key order
 * — required fields first, the two optional fields last — so selecting every
 * field reproduces the full record's key order exactly.
 */
export const SESSION_RECORD_FIELD = {
  ID: "id",
  STATUS: "status",
  PRIORITY: SESSION_FRONT_MATTER.PRIORITY,
  GIT_REF: SESSION_FRONT_MATTER.GIT_REF,
  GOAL: SESSION_FRONT_MATTER.GOAL,
  NEXT_STEP: SESSION_FRONT_MATTER.NEXT_STEP,
  SPECS: SESSION_FRONT_MATTER.SPECS,
  FILES: SESSION_FRONT_MATTER.FILES,
  CREATED_AT: SESSION_FRONT_MATTER.CREATED_AT,
  AGENT_SESSION_ID: SESSION_FRONT_MATTER.AGENT_SESSION_ID,
} as const satisfies Record<string, keyof SessionRecord>;

export type SessionRecordField = (typeof SESSION_RECORD_FIELD)[keyof typeof SESSION_RECORD_FIELD];

/** Every valid session-record field name, in registry order. */
export const SESSION_RECORD_FIELDS: readonly SessionRecordField[] = Object.values(SESSION_RECORD_FIELD);

/**
 * Flat per-session record emitted by the JSON list output: `id` and `status`
 * alongside the frontmatter fields, with no absolute file path. Optional fields
 * are present only when the session carries them.
 */
export interface SessionRecord {
  id: string;
  status: SessionStatus;
  priority: SessionPriority;
  git_ref: string;
  goal: string;
  next_step: string;
  specs: string[];
  files: string[];
  created_at?: string;
  agent_session_id?: string;
}

/**
 * Flattens a session into its JSON record — `id` and `status` hoisted alongside
 * the metadata fields, with the absolute path dropped. Optional fields appear
 * only when the session's metadata carries them.
 *
 * @param session - The session to flatten
 * @returns The flat session record
 */
export function toSessionRecord(session: Session): SessionRecord {
  const { id, status, metadata } = session;
  const record: SessionRecord = {
    id,
    status,
    priority: metadata.priority,
    git_ref: metadata.git_ref,
    goal: metadata.goal,
    next_step: metadata.next_step,
    specs: metadata.specs,
    files: metadata.files,
  };
  if (metadata.created_at !== undefined) {
    record.created_at = metadata.created_at;
  }
  if (metadata.agent_session_id !== undefined) {
    record.agent_session_id = metadata.agent_session_id;
  }
  return record;
}

/**
 * Projects a session record to only the named fields, in the order named. A
 * named field whose value is absent on the record is omitted.
 *
 * @param record - The session record to project
 * @param fields - The fields to retain, in output order
 * @returns A record carrying only the selected, present fields
 */
export function projectSessionRecord(
  record: SessionRecord,
  fields: readonly SessionRecordField[],
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    const value = record[field];
    if (value !== undefined) {
      projected[field] = value;
    }
  }
  return projected;
}

/**
 * Type guard: whether a string is a valid session-record field name.
 */
function isSessionRecordField(value: string): value is SessionRecordField {
  return (SESSION_RECORD_FIELDS as readonly string[]).includes(value);
}

/**
 * Parses a comma-separated `--fields` selection into validated field names,
 * preserving order. Throws `SessionInvalidFieldError` for any token outside the
 * session-record field set, and for a selection that names no field at all (an
 * empty value or one of only separators) — an empty selection would otherwise
 * silently emit fieldless records.
 *
 * @param input - The raw `--fields` value
 * @returns The validated field selection, in the order named
 * @throws SessionInvalidFieldError when a token is not a valid field name, or when the selection names no field
 */
export function parseFieldSelection(input: string): SessionRecordField[] {
  const tokens = input
    .split(FIELD_SELECTION_SEPARATOR)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new SessionInvalidFieldError(input, SESSION_RECORD_FIELDS);
  }

  const selection: SessionRecordField[] = [];
  for (const token of tokens) {
    if (!isSessionRecordField(token)) {
      throw new SessionInvalidFieldError(token, SESSION_RECORD_FIELDS);
    }
    selection.push(token);
  }
  return selection;
}
