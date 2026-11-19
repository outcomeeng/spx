import { createHash } from "node:crypto";

import { AGENT_IDENTITY_KIND, type AgentIdentity, resolveAgentIdentity } from "@/domains/agent-environment/config";

export type AgentSessionEnvironment = Readonly<Record<string, string | undefined>>;

export const AGENT_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

const AGENT_SESSION_TOKEN_UNSAFE_PATTERN = /[^A-Za-z0-9_-]+/g;
const AGENT_SESSION_TOKEN_EDGE_SEPARATOR_PATTERN = /^-+|-+$/g;
const AGENT_SESSION_TOKEN_SEPARATOR = "-";
const AGENT_SESSION_TOKEN_HASH_ALGORITHM = "sha256";
const AGENT_SESSION_TOKEN_HASH_ENCODING = "hex";
const AGENT_SESSION_TOKEN_HASH_LENGTH = 12;
const EMPTY_TOKEN = "";

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

export function normalizeAgentSessionToken(value: string): string {
  if (AGENT_SESSION_TOKEN_PATTERN.test(value)) return value;

  const normalized = value
    .replace(AGENT_SESSION_TOKEN_UNSAFE_PATTERN, AGENT_SESSION_TOKEN_SEPARATOR)
    .replace(AGENT_SESSION_TOKEN_EDGE_SEPARATOR_PATTERN, EMPTY_TOKEN);
  const hash = hashAgentSessionToken(value);
  return normalized.length === 0 ? hash : `${normalized}${AGENT_SESSION_TOKEN_SEPARATOR}${hash}`;
}

/**
 * The identity rule's verdict for the invoking environment: the one agent whose
 * own identity variable alone is non-empty, with its session, or none, or the
 * ambiguous set of identity variables found set.
 */
export function resolveAgentSessionIdentity(env: AgentSessionEnvironment): AgentIdentity {
  return resolveAgentIdentity(env);
}

/**
 * The normalized session id of the agent the identity rule identifies, or none
 * when no identity variable, or two or more, are non-empty.
 */
export function resolveAgentSessionId(env: AgentSessionEnvironment): string | undefined {
  const identity = resolveAgentIdentity(env);
  return identity.kind === AGENT_IDENTITY_KIND.IDENTIFIED
    ? normalizeAgentSessionToken(identity.sessionId)
    : undefined;
}
