import { homedir } from "node:os";
import { resolve } from "node:path";

import { AGENT_SESSION_STORE } from "./protocol";

export const AGENT_HOME_ENV = {
  CODEX: "CODEX_HOME",
  CLAUDE: "CLAUDE_CONFIG_DIR",
  PI_AGENT: "PI_CODING_AGENT_DIR",
  PI_SESSIONS: "PI_CODING_AGENT_SESSION_DIR",
} as const;

export interface AgentHomeDirs {
  readonly codex: string;
  readonly claudeCode: string;
  readonly piAgent: string;
  readonly piSessions: string;
}

export interface AgentHomeResolutionDeps {
  readonly homeDir: () => string;
}

export type AgentHomeEnvironment = Readonly<Record<string, string | undefined>>;

const defaultAgentHomeResolutionDeps: AgentHomeResolutionDeps = {
  homeDir: homedir,
};

export function piSessionStoreDir(piAgentDir: string, piSessionDir?: string): string {
  return piSessionDir ?? resolve(piAgentDir, AGENT_SESSION_STORE.PI_SESSIONS_DIR);
}

export function agentHomeDirsFromHomeDir(homeDir: string): AgentHomeDirs {
  const piAgent = resolve(homeDir, AGENT_SESSION_STORE.PI_DIR, AGENT_SESSION_STORE.PI_AGENT_DIR);
  return {
    codex: resolve(homeDir, AGENT_SESSION_STORE.CODEX_DIR),
    claudeCode: resolve(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR),
    piAgent,
    piSessions: piSessionStoreDir(piAgent),
  };
}

export function resolveAgentHomeDirs(
  env: AgentHomeEnvironment = process.env,
  deps: AgentHomeResolutionDeps = defaultAgentHomeResolutionDeps,
): AgentHomeDirs {
  const defaults = agentHomeDirsFromHomeDir(deps.homeDir());
  const piAgent = env[AGENT_HOME_ENV.PI_AGENT] ?? defaults.piAgent;
  return {
    codex: env[AGENT_HOME_ENV.CODEX] ?? defaults.codex,
    claudeCode: env[AGENT_HOME_ENV.CLAUDE] ?? defaults.claudeCode,
    piAgent,
    piSessions: piSessionStoreDir(piAgent, env[AGENT_HOME_ENV.PI_SESSIONS]),
  };
}
