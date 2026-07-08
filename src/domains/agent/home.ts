import { homedir } from "node:os";
import { resolve } from "node:path";

import { AGENT_SESSION_STORE } from "./protocol";

export const AGENT_HOME_ENV = {
  CODEX: "CODEX_HOME",
  CLAUDE: "CLAUDE_CONFIG_DIR",
} as const;

export interface AgentHomeDirs {
  readonly codex: string;
  readonly claudeCode: string;
}

export interface AgentHomeResolutionDeps {
  readonly homeDir: () => string;
}

export type AgentHomeEnvironment = Readonly<Record<string, string | undefined>>;

const defaultAgentHomeResolutionDeps: AgentHomeResolutionDeps = {
  homeDir: homedir,
};

export function agentHomeDirsFromHomeDir(homeDir: string): AgentHomeDirs {
  return {
    codex: resolve(homeDir, AGENT_SESSION_STORE.CODEX_DIR),
    claudeCode: resolve(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR),
  };
}

export function resolveAgentHomeDirs(
  env: AgentHomeEnvironment = process.env,
  deps: AgentHomeResolutionDeps = defaultAgentHomeResolutionDeps,
): AgentHomeDirs {
  const defaults = agentHomeDirsFromHomeDir(deps.homeDir());
  return {
    codex: env[AGENT_HOME_ENV.CODEX] ?? defaults.codex,
    claudeCode: env[AGENT_HOME_ENV.CLAUDE] ?? defaults.claudeCode,
  };
}
