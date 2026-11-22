import {
  AGENT_SESSION_TOKEN_PATTERN,
  nonEmptyEnvValue,
  normalizeAgentSessionToken,
} from "@/lib/agent-environment/session-token";

export { AGENT_SESSION_TOKEN_PATTERN, nonEmptyEnvValue, normalizeAgentSessionToken };

export const AGENT_SESSION_ENV = {
  CLAUDE_SESSION_ID: "CLAUDE_SESSION_ID",
  CODEX_THREAD_ID: "CODEX_THREAD_ID",
} as const;

export type AgentSessionEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveAgentSessionId(env: AgentSessionEnvironment): string | undefined {
  const raw = nonEmptyEnvValue(env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID])
    ?? nonEmptyEnvValue(env[AGENT_SESSION_ENV.CODEX_THREAD_ID]);
  return raw === undefined ? undefined : normalizeAgentSessionToken(raw);
}
