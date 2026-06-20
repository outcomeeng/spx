/**
 * Session listing and sorting utilities.
 *
 * @module session/list
 */

import { Chalk, type ChalkInstance } from "chalk";
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

/**
 * Explicit color flags the `list`/`todo` descriptor maps from `--color` and
 * `--no-color`. `AUTO` is the absence of both flags, so the resolver decides
 * from the TTY state and `NO_COLOR`.
 */
export const COLOR_FLAG = {
  /** `--color` was passed: force styled output. */
  ON: "on",
  /** `--no-color` was passed: force plain output. */
  OFF: "off",
  /** Neither flag was passed: decide from the TTY state and `NO_COLOR`. */
  AUTO: "auto",
} as const;

export type ColorFlag = (typeof COLOR_FLAG)[keyof typeof COLOR_FLAG];

/** Process facts the color decision reads, resolved by the descriptor. */
export interface ColorDecisionInput {
  /** Whether stdout is a TTY (`process.stdout.isTTY`). */
  readonly isTty: boolean;
  /** Whether `NO_COLOR` is present and non-empty in the environment. */
  readonly noColor: boolean;
  /** The explicit color flag, or `AUTO` when neither flag was passed. */
  readonly colorFlag: ColorFlag;
}

/**
 * Resolves whether the non-interactive list output is styled.
 *
 * `--color` (`ON`) forces styling and `--no-color` (`OFF`) forces plain output,
 * each overriding both the TTY state and `NO_COLOR`. With neither flag (`AUTO`),
 * styling is enabled only on a TTY that carries no `NO_COLOR`.
 *
 * @param input - The resolved TTY state, `NO_COLOR` presence, and color flag.
 * @returns Whether the formatter should emit ANSI styling escapes.
 */
export function resolveListColor(input: ColorDecisionInput): boolean {
  switch (input.colorFlag) {
    case COLOR_FLAG.ON:
      return true;
    case COLOR_FLAG.OFF:
      return false;
    default:
      return input.isTty && !input.noColor;
  }
}

/** Floor width the formatter renders against; widths below it are not supplied. */
export const LIST_TEXT_MIN_WIDTH = 8;
/** Width used when the terminal width is unknown (non-TTY stdout has no columns). */
export const DEFAULT_LIST_WIDTH = 80;
/** Indent every rendered session line carries. */
const LIST_INDENT = "  ";
/** Joins a session's goal and next step in the summary segment. */
const LIST_SUMMARY_SEPARATOR = " -> ";

/** Options the pure list text formatter renders against. */
export interface ListTextOptions {
  /** Whether to emit ANSI styling escapes. */
  readonly color: boolean;
  /** Maximum display width every rendered line stays within. */
  readonly width: number;
}

/**
 * Priority badge style, keyed by `SESSION_PRIORITY` so a new priority value
 * surfaces as a missing key at compile time rather than an unstyled badge.
 */
const PRIORITY_STYLE: Record<SessionPriority, (chalk: ChalkInstance, text: string) => string> = {
  [SESSION_PRIORITY.HIGH]: (chalk, text) => chalk.red(text),
  [SESSION_PRIORITY.MEDIUM]: (chalk, text) => chalk.yellow(text),
  [SESSION_PRIORITY.LOW]: (chalk, text) => chalk.gray(text),
};

/**
 * Renders one session as an indented line whose display width never exceeds
 * `width`. Each visible segment (id, priority badge, goal/next-step summary)
 * is budgeted against the remaining width before styling, so the styled line's
 * display width equals the budgeted plain width.
 */
function formatSessionLine(session: Session, width: number, chalk: ChalkInstance): string {
  const { id, metadata } = session;
  const badge = metadata.priority === DEFAULT_PRIORITY ? "" : ` [${metadata.priority}]`;
  const summary = metadata.goal.length > 0 && metadata.next_step.length > 0
    ? ` ${metadata.goal}${LIST_SUMMARY_SEPARATOR}${metadata.next_step}`
    : "";

  let remaining = Math.max(0, width - LIST_INDENT.length);
  const idShown = id.slice(0, remaining);
  remaining -= idShown.length;
  const badgeShown = badge.slice(0, remaining);
  remaining -= badgeShown.length;
  const summaryShown = summary.slice(0, remaining);

  const styledBadge = badgeShown.length > 0 ? PRIORITY_STYLE[metadata.priority](chalk, badgeShown) : "";
  return `${LIST_INDENT}${chalk.dim(idShown)}${styledBadge}${chalk.dim(summaryShown)}`;
}

/**
 * Formats one status group's sessions as newline-joined text. Styling is
 * applied through a chalk instance whose level is fixed from `opts.color`, so
 * the output is a deterministic function of `(sessions, color, width)` and
 * consults no environment state; every line stays within `opts.width`.
 *
 * @param sessions - The status group's sessions, already sorted by the caller.
 * @param opts - Whether to style and the maximum display width per line.
 * @returns The group's session lines joined by newlines.
 */
export function formatSessionListText(sessions: Session[], opts: ListTextOptions): string {
  const chalk = new Chalk({ level: opts.color ? 1 : 0 });
  return sessions.map((session) => formatSessionLine(session, opts.width, chalk)).join("\n");
}

/**
 * Renders a status group's header — the uppercased status name followed by a
 * colon — styled bold when color is enabled. Pure: the chalk level is fixed
 * from `color`, never the environment.
 *
 * @param status - The status whose group the header introduces.
 * @param color - Whether to emit ANSI styling escapes.
 * @returns The styled header line.
 */
export function formatStatusHeader(status: SessionStatus, color: boolean): string {
  const chalk = new Chalk({ level: color ? 1 : 0 });
  return chalk.bold(`${status.toUpperCase()}:`);
}
