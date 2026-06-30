import {
  AGENT,
  type HarnessEnvironmentConfig,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import { RUNTIME_CONFIG_STATE_FIELDS } from "@/domains/agent-environment/runtime-config";

export function enabledHarnessEnvironment(): HarnessEnvironmentConfig {
  return {
    ...harnessEnvironmentConfigDescriptor.defaults,
    agents: {
      [AGENT.CODEX]: {
        ...harnessEnvironmentConfigDescriptor.defaults.agents[AGENT.CODEX],
        enabled: true,
      },
      [AGENT.CLAUDE_CODE]: {
        ...harnessEnvironmentConfigDescriptor.defaults.agents[AGENT.CLAUDE_CODE],
        enabled: true,
      },
    },
  };
}

export function readManagedRuntimeConfigState(value: unknown): Record<string, unknown> {
  const root = readRecord(value);
  const spx = readRecord(root[RUNTIME_CONFIG_STATE_FIELDS.SPX]);
  return readRecord(spx[RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT]);
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected runtime config value to be a record");
  }
  return value as Record<string, unknown>;
}
