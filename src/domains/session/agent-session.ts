import { createHash } from "node:crypto";

export const AGENT_SESSION_ENV = {
  CLAUDE_SESSION_ID: "CLAUDE_SESSION_ID",
  CODEX_THREAD_ID: "CODEX_THREAD_ID",
} as const;

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
  return value === undefined || value.length === 0 ? undefined : value;
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

export function resolveAgentSessionId(env: AgentSessionEnvironment): string | undefined {
  const raw = nonEmptyEnvValue(env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID])
    ?? nonEmptyEnvValue(env[AGENT_SESSION_ENV.CODEX_THREAD_ID]);
  return raw === undefined ? undefined : normalizeAgentSessionToken(raw);
}
