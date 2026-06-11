export const AGENT_SESSION_ENV = {
  CLAUDE_SESSION_ID: "CLAUDE_SESSION_ID",
  CODEX_THREAD_ID: "CODEX_THREAD_ID",
} as const;

export type AgentSessionEnvironment = Readonly<Record<string, string | undefined>>;

function nonEmptyEnvValue(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

export function resolveAgentSessionId(env: AgentSessionEnvironment): string | undefined {
  return nonEmptyEnvValue(env[AGENT_SESSION_ENV.CLAUDE_SESSION_ID])
    ?? nonEmptyEnvValue(env[AGENT_SESSION_ENV.CODEX_THREAD_ID]);
}
