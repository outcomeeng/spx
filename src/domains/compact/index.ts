import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  type AgentSessionEnvironment,
  normalizeAgentSessionToken,
  resolveAgentSessionId,
} from "@/domains/session/agent-session";
import { composeScopeDir, type JsonRecord, STATE_STORE_DOMAIN } from "@/lib/state-store";

export const COMPACT_STORE_PATH = {
  STASH_FILE: "stash.jsonl",
} as const;

export const COMPACT_RECORD_FIELDS = {
  ACTIVE_NODE: "active_node",
  HAS_FOUNDATION: "has_foundation",
} as const;

export const COMPACT_MARKER = {
  FOUNDATION: "SPEC_TREE_FOUNDATION",
  CONTEXT: "SPEC_TREE_CONTEXT",
  TARGET_ATTRIBUTE: "target",
  ESCAPED_TARGET_QUOTE: "\\\"",
  UNESCAPED_TARGET_QUOTE: "\"",
} as const;

export const COMPACT_ERROR = {
  RECORD_SHAPE_INVALID: "compact record shape invalid",
} as const;

export interface CompactRecord extends JsonRecord {
  readonly active_node: string;
  readonly has_foundation: true;
}

const EMPTY_ACTIVE_NODE = "";
const JSONL_LINE_SEPARATOR = "\n";
const ATTRIBUTE_ASSIGNMENT = "=";
const ESCAPE_CHARACTER = "\\";
const CONTEXT_TARGET_PREFIX = `${COMPACT_MARKER.TARGET_ATTRIBUTE}${ATTRIBUTE_ASSIGNMENT}`;
const NODE_PATH_PREFIX = "spx/";

/** Normalized `--session-id` when supplied non-empty; otherwise the agent-session environment resolver. */
export function resolveCompactSessionToken(
  sessionId: string | undefined,
  env: AgentSessionEnvironment,
): string | undefined {
  if (sessionId !== undefined && sessionId.length > 0) {
    return normalizeAgentSessionToken(sessionId);
  }
  return resolveAgentSessionId(env);
}

export function extractCompactRecord(transcript: string): CompactRecord | undefined {
  let hasFoundation = false;
  let activeNode = EMPTY_ACTIVE_NODE;
  for (const value of transcriptStringValues(transcript)) {
    if (value.includes(COMPACT_MARKER.FOUNDATION)) hasFoundation = true;
    activeNode = extractLastContextTarget(value) ?? activeNode;
  }

  if (!hasFoundation) return undefined;
  return {
    [COMPACT_RECORD_FIELDS.ACTIVE_NODE]: activeNode,
    [COMPACT_RECORD_FIELDS.HAS_FOUNDATION]: true,
  };
}

export function compactStashPath(worktreeScopeDir: string, sessionToken: string): Result<string> {
  const compactScope = composeScopeDir(worktreeScopeDir, sessionToken, STATE_STORE_DOMAIN.COMPACT);
  if (!compactScope.ok) return compactScope;
  return { ok: true, value: join(compactScope.value, COMPACT_STORE_PATH.STASH_FILE) };
}

export function parseCompactRecord(value: unknown): Result<CompactRecord> {
  if (
    typeof value === "object"
    && value !== null
    && COMPACT_RECORD_FIELDS.ACTIVE_NODE in value
    && COMPACT_RECORD_FIELDS.HAS_FOUNDATION in value
    && typeof (value as Record<string, unknown>)[COMPACT_RECORD_FIELDS.ACTIVE_NODE] === "string"
    && (value as Record<string, unknown>)[COMPACT_RECORD_FIELDS.HAS_FOUNDATION] === true
  ) {
    return {
      ok: true,
      value: {
        active_node: (value as Record<string, string>)[COMPACT_RECORD_FIELDS.ACTIVE_NODE] ?? EMPTY_ACTIVE_NODE,
        has_foundation: true,
      },
    };
  }
  return { ok: false, error: COMPACT_ERROR.RECORD_SHAPE_INVALID };
}

function transcriptStringValues(transcript: string): readonly string[] {
  const values: string[] = [];
  for (const rawLine of transcript.split(JSONL_LINE_SEPARATOR)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    try {
      collectStringValues(JSON.parse(line) as unknown, values);
    } catch {
      continue;
    }
  }
  return values;
}

function collectStringValues(value: unknown, values: string[]): void {
  if (typeof value === "string") {
    values.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStringValues(entry, values);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) collectStringValues(entry, values);
  }
}

function extractLastContextTarget(value: string): string | undefined {
  let activeNode: string | undefined;
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const contextIndex = value.indexOf(COMPACT_MARKER.CONTEXT, searchFrom);
    if (contextIndex < 0) return activeNode;
    const target = extractContextTargetAt(value, contextIndex + COMPACT_MARKER.CONTEXT.length);
    if (target !== undefined) activeNode = target;
    searchFrom = contextIndex + COMPACT_MARKER.CONTEXT.length;
  }
  return activeNode;
}

function extractContextTargetAt(value: string, searchFrom: number): string | undefined {
  const targetIndex = value.indexOf(CONTEXT_TARGET_PREFIX, searchFrom);
  if (targetIndex < 0) return undefined;
  const quoteIndex = findOpeningTargetQuote(value, targetIndex + CONTEXT_TARGET_PREFIX.length);
  if (quoteIndex === undefined) return undefined;
  const target = readTargetPath(value, quoteIndex + COMPACT_MARKER.UNESCAPED_TARGET_QUOTE.length);
  return target.startsWith(NODE_PATH_PREFIX) ? target : undefined;
}

function findOpeningTargetQuote(value: string, startIndex: number): number | undefined {
  let index = startIndex;
  while (value[index] === ESCAPE_CHARACTER) index += 1;
  return value[index] === COMPACT_MARKER.UNESCAPED_TARGET_QUOTE ? index : undefined;
}

function readTargetPath(value: string, startIndex: number): string {
  let endIndex = startIndex;
  while (endIndex < value.length && isTargetPathCharacter(value[endIndex] ?? EMPTY_ACTIVE_NODE)) {
    endIndex += 1;
  }
  return value.slice(startIndex, endIndex);
}

function isTargetPathCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || character === "."
    || character === "_"
    || character === "-"
    || character === "/";
}
