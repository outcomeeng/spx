import {
  AGENT_RUNTIME,
  type AgentEnvironmentConfig,
  agentEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import { RUNTIME_CONFIG_STATE_FIELDS } from "@/domains/agent-environment/runtime-config";

export function enabledAgentEnvironment(): AgentEnvironmentConfig {
  return {
    ...agentEnvironmentConfigDescriptor.defaults,
    runtimes: {
      [AGENT_RUNTIME.CODEX]: {
        ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CODEX],
        enabled: true,
      },
      [AGENT_RUNTIME.CLAUDE_CODE]: {
        ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CLAUDE_CODE],
        enabled: true,
      },
    },
  };
}

export function readManagedRuntimeConfigState(value: unknown): Record<string, unknown> {
  const root = readRecord(value);
  const spx = readRecord(root[RUNTIME_CONFIG_STATE_FIELDS.SPX]);
  return readRecord(spx[RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]);
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected runtime config value to be a record");
  }
  return value as Record<string, unknown>;
}
