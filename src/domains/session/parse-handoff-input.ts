/**
 * Pure parser for the `spx session handoff` JSON-prefix wire format.
 *
 * The wire format is a single JSON object at the start of stdin holding
 * caller-supplied structured fields, immediately followed by the body bytes
 * verbatim. An optional single LF or CRLF between the closing `}` and the
 * body is consumed as a separator.
 *
 * @module domains/session/parse-handoff-input
 */

import { SessionInvalidJsonHeaderError, SessionLegacyFrontmatterInputError } from "@/domains/session/errors";
import {
  DEFAULT_PRIORITY,
  SESSION_FRONT_MATTER,
  SESSION_PRIORITY,
  type SessionPriority,
} from "@/domains/session/types";

const LEGACY_FRONTMATTER_PREFIX = /^---\r?\n/;
const JSON_OBJECT_OPEN_CHAR = "{";
const CARRIAGE_RETURN_CHAR_CODE = "\r".charCodeAt(0);
const NEWLINE_CHAR_CODE = "\n".charCodeAt(0);
const BACKSLASH_CHAR_CODE = "\\".charCodeAt(0);
const DOUBLE_QUOTE_CHAR_CODE = "\"".charCodeAt(0);
const OPEN_BRACE_CHAR_CODE = "{".charCodeAt(0);
const CLOSE_BRACE_CHAR_CODE = "}".charCodeAt(0);
const UNBALANCED_HEADER_END = -1;
const LF_SEPARATOR_LENGTH = 1;
const CRLF_SEPARATOR_LENGTH = 2;

const SESSION_PRIORITY_VALUES = new Set<string>(Object.values(SESSION_PRIORITY));

/**
 * Caller-supplied structured fields recognized by `parseHandoffInput`.
 *
 * CLI-prefilled fields (`branch`, `worktree`, `created_at`, `agent_session_id`)
 * are not part of this shape and are silently ignored if the caller includes
 * them in the JSON object — the handoff command sources them from the git
 * context and process environment instead.
 */
export interface HandoffHeader {
  readonly priority: SessionPriority;
  readonly goal: string;
  readonly next_step: string;
  readonly specs: readonly string[];
  readonly files: readonly string[];
}

/**
 * Result of parsing `spx session handoff` stdin.
 */
export interface ParsedHandoffInput {
  readonly header: HandoffHeader;
  readonly body: string;
}

/**
 * Parses `spx session handoff` stdin per the JSON-prefix wire format.
 *
 * Algorithm:
 *
 * 1. Reject input opening with the YAML-frontmatter delimiter `---\n` or
 *    `---\r\n` with `SessionLegacyFrontmatterInputError`.
 * 2. Reject input that does not open with `{` with
 *    `SessionInvalidJsonHeaderError`.
 * 3. Scan from the opening `{` to find the matching closing `}` while
 *    respecting JSON string state — characters inside double-quoted strings
 *    do not affect brace depth, and a backslash escapes the next character
 *    inside a string. Unbalanced braces raise `SessionInvalidJsonHeaderError`.
 * 4. `JSON.parse` the header substring; parse failures raise
 *    `SessionInvalidJsonHeaderError`.
 * 5. Validate the parsed object against the caller-field schema. Schema
 *    failures raise `SessionInvalidJsonHeaderError`.
 * 6. Return the parsed header and the body bytes after the closing `}` (with
 *    a single optional `LF` or `CRLF` separator consumed).
 *
 * @param stdin - Raw stdin bytes
 * @returns Parsed header and body
 * @throws {SessionLegacyFrontmatterInputError} When stdin opens with `---\n`
 * @throws {SessionInvalidJsonHeaderError} When the header is malformed or
 *   fails schema validation
 */
export function parseHandoffInput(stdin: string): ParsedHandoffInput {
  if (LEGACY_FRONTMATTER_PREFIX.test(stdin)) {
    throw new SessionLegacyFrontmatterInputError();
  }

  if (!stdin.startsWith(JSON_OBJECT_OPEN_CHAR)) {
    throw new SessionInvalidJsonHeaderError(
      "stdin must begin with a JSON object opening with '{'",
    );
  }

  const headerEnd = findJsonObjectEnd(stdin);
  if (headerEnd === UNBALANCED_HEADER_END) {
    throw new SessionInvalidJsonHeaderError(
      "unbalanced JSON object — opening brace has no matching close",
    );
  }

  const headerText = stdin.slice(0, headerEnd + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(headerText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "JSON.parse failed";
    throw new SessionInvalidJsonHeaderError(detail);
  }

  const header = validateHandoffHeader(parsed);

  const bodyStart = consumeOptionalBodySeparator(stdin, headerEnd + 1);

  return { header, body: stdin.slice(bodyStart) };
}

function consumeOptionalBodySeparator(stdin: string, bodyStart: number): number {
  if (
    stdin.charCodeAt(bodyStart) === CARRIAGE_RETURN_CHAR_CODE
    && stdin.charCodeAt(bodyStart + LF_SEPARATOR_LENGTH) === NEWLINE_CHAR_CODE
  ) {
    return bodyStart + CRLF_SEPARATOR_LENGTH;
  }

  if (stdin.charCodeAt(bodyStart) === NEWLINE_CHAR_CODE) {
    return bodyStart + LF_SEPARATOR_LENGTH;
  }

  return bodyStart;
}

/**
 * Scans `stdin` from index `0` (assumed to start with `{`) and returns the
 * index of the closing `}` that balances the opening brace.
 *
 * JSON string-state aware: characters inside a double-quoted string don't
 * affect brace depth, and a backslash inside a string escapes the next
 * character (so `"\\""` and `"\""` are valid strings).
 *
 * @returns Index of the matching closing brace, or `UNBALANCED_HEADER_END`
 *   when the opening brace has no matching close in `stdin`.
 */
function findJsonObjectEnd(stdin: string): number {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < stdin.length; i++) {
    const code = stdin.charCodeAt(i);
    if (inString) {
      if (code === BACKSLASH_CHAR_CODE) {
        // Skip the next character (an escape sequence is one logical unit).
        i += 1;
        continue;
      }
      if (code === DOUBLE_QUOTE_CHAR_CODE) {
        inString = false;
      }
      continue;
    }
    if (code === DOUBLE_QUOTE_CHAR_CODE) {
      inString = true;
      continue;
    }
    if (code === OPEN_BRACE_CHAR_CODE) {
      depth += 1;
      continue;
    }
    if (code === CLOSE_BRACE_CHAR_CODE) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return UNBALANCED_HEADER_END;
}

/**
 * Validates `parsed` against the JSON-prefix header schema and narrows the
 * result to `HandoffHeader`.
 *
 * Extra fields are silently dropped — callers who include CLI-prefilled
 * fields like `branch` or `worktree` in the JSON have those fields ignored,
 * preserving the "caller-supplied branch and worktree are ignored" invariant
 * by construction.
 */
function validateHandoffHeader(parsed: unknown): HandoffHeader {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SessionInvalidJsonHeaderError("header must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  const priority = ensurePriorityOrDefault(obj[SESSION_FRONT_MATTER.PRIORITY]);
  const goal = ensureStringOrEmpty(obj[SESSION_FRONT_MATTER.GOAL], SESSION_FRONT_MATTER.GOAL);
  const nextStep = ensureStringOrEmpty(obj[SESSION_FRONT_MATTER.NEXT_STEP], SESSION_FRONT_MATTER.NEXT_STEP);
  const specs = ensureStringArrayOrDefault(obj[SESSION_FRONT_MATTER.SPECS], SESSION_FRONT_MATTER.SPECS);
  const files = ensureStringArrayOrDefault(obj[SESSION_FRONT_MATTER.FILES], SESSION_FRONT_MATTER.FILES);

  return {
    priority,
    goal,
    next_step: nextStep,
    specs,
    files,
  };
}

/**
 * Coerces an optional JSON value to a recognized `SessionPriority`.
 *
 * Returns the default priority when the field is missing (`undefined`). Throws
 * `SessionInvalidJsonHeaderError` when the value is present but is not a
 * string matching one of the registered priority values.
 */
function ensurePriorityOrDefault(value: unknown): SessionPriority {
  if (value === undefined) return DEFAULT_PRIORITY;
  if (typeof value !== "string" || !SESSION_PRIORITY_VALUES.has(value)) {
    throw new SessionInvalidJsonHeaderError(
      `${SESSION_FRONT_MATTER.PRIORITY} must be one of ${[...SESSION_PRIORITY_VALUES].join(", ")}`,
    );
  }
  return value as SessionPriority;
}

/**
 * Coerces an optional JSON value to a string.
 *
 * Returns an empty string when the field is missing (`undefined`) so the
 * downstream non-empty validation in `handoffCommand` surfaces the
 * semantic-content error (`SessionInvalidGoalError` / `SessionInvalidNextStepError`)
 * rather than a structural `SessionInvalidJsonHeaderError`. Throws
 * `SessionInvalidJsonHeaderError` only when the value is present but is not
 * a string.
 */
function ensureStringOrEmpty(value: unknown, fieldName: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new SessionInvalidJsonHeaderError(`${fieldName} must be a string`);
  }
  return value;
}

/**
 * Coerces an optional JSON value to a readonly string array.
 *
 * Returns an empty array when the field is missing (`undefined`). Throws
 * `SessionInvalidJsonHeaderError` when the value is present but not an array
 * of strings.
 */
function ensureStringArrayOrDefault(value: unknown, fieldName: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SessionInvalidJsonHeaderError(`${fieldName} must be an array of strings`);
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw new SessionInvalidJsonHeaderError(`${fieldName} must be an array of strings`);
    }
  }
  return value as readonly string[];
}
