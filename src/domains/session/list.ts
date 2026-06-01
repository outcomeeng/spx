/**
 * Session listing and sorting utilities.
 *
 * @module session/list
 */

import { parse as parseYaml } from "yaml";

import { parseSessionId } from "./timestamp";
import {
  DEFAULT_PRIORITY,
  PRIORITY_ORDER,
  type Session,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  type SessionMetadata,
  type SessionPriority,
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
