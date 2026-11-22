/**
 * The safe agent session token: the form an agent's session id takes wherever spx names a session,
 * a claim, or a state path by it.
 *
 * @module lib/agent-environment/session-token
 */

import { createHash } from "node:crypto";

export const AGENT_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

const AGENT_SESSION_TOKEN_UNSAFE_PATTERN = /[^A-Za-z0-9_-]+/g;
const AGENT_SESSION_TOKEN_EDGE_SEPARATOR_PATTERN = /^-+|-+$/g;
const AGENT_SESSION_TOKEN_SEPARATOR = "-";
const AGENT_SESSION_TOKEN_HASH_ALGORITHM = "sha256";
const AGENT_SESSION_TOKEN_HASH_ENCODING = "hex";
const AGENT_SESSION_TOKEN_HASH_LENGTH = 12;
const EMPTY_TOKEN = "";

/** The trimmed value, or none when the value is absent, empty, or whitespace-only. */
export function nonEmptyEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function hashAgentSessionToken(value: string): string {
  return createHash(AGENT_SESSION_TOKEN_HASH_ALGORITHM)
    .update(value)
    .digest(AGENT_SESSION_TOKEN_HASH_ENCODING)
    .slice(0, AGENT_SESSION_TOKEN_HASH_LENGTH);
}

/** The value itself when it is already a safe token; otherwise its safe characters joined by a hash suffix. */
export function normalizeAgentSessionToken(value: string): string {
  if (AGENT_SESSION_TOKEN_PATTERN.test(value)) return value;

  const normalized = value
    .replace(AGENT_SESSION_TOKEN_UNSAFE_PATTERN, AGENT_SESSION_TOKEN_SEPARATOR)
    .replace(AGENT_SESSION_TOKEN_EDGE_SEPARATOR_PATTERN, EMPTY_TOKEN);
  const hash = hashAgentSessionToken(value);
  return normalized.length === 0 ? hash : `${normalized}${AGENT_SESSION_TOKEN_SEPARATOR}${hash}`;
}
