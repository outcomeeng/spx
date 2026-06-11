import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  composeScopeDir,
  STATE_STORE_DOMAIN,
  type JsonRecord,
} from "@/lib/state-store";

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

const CONTEXT_TARGET_PATTERN = /SPEC_TREE_CONTEXT\s+target=\\?"(spx\/[A-Za-z0-9._/-]+)/g;
const EMPTY_ACTIVE_NODE = "";

export function extractCompactRecord(transcript: string): CompactRecord | undefined {
  if (!transcript.includes(COMPACT_MARKER.FOUNDATION)) return undefined;

  let activeNode = EMPTY_ACTIVE_NODE;
  for (const match of transcript.matchAll(CONTEXT_TARGET_PATTERN)) {
    activeNode = match[1] ?? EMPTY_ACTIVE_NODE;
  }

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
