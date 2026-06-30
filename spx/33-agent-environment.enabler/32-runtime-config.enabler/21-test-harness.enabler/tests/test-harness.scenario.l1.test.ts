import { describe, expect, it } from "vitest";

import { AGENT, harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { RUNTIME_CONFIG_STATE_FIELDS } from "@/domains/agent-environment/runtime-config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  enabledHarnessEnvironment,
  readManagedRuntimeConfigState,
  readRecord,
} from "@testing/harnesses/agent-environment/runtime-config";

describe("runtime-config test harness", () => {
  it("enables both agents over the descriptor defaults", () => {
    const config = enabledHarnessEnvironment();

    expect(config.instructions).toEqual(harnessEnvironmentConfigDescriptor.defaults.instructions);
    expect(config.pluginBootstrap).toEqual(harnessEnvironmentConfigDescriptor.defaults.pluginBootstrap);
    expect(config.agents[AGENT.CODEX]?.hooks).toEqual(
      harnessEnvironmentConfigDescriptor.defaults.agents[AGENT.CODEX].hooks,
    );
    expect(config.agents[AGENT.CLAUDE_CODE]?.hooks).toEqual(
      harnessEnvironmentConfigDescriptor.defaults.agents[AGENT.CLAUDE_CODE].hooks,
    );
    expect(config.agents[AGENT.CODEX]?.enabled).toBe(true);
    expect(config.agents[AGENT.CLAUDE_CODE]?.enabled).toBe(true);
  });

  it("navigates the managed harness-environment record out of a parsed state", () => {
    const innerKey = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const innerValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const inner = { [innerKey]: innerValue };
    const state = {
      [RUNTIME_CONFIG_STATE_FIELDS.SPX]: { [RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT]: inner },
    };

    expect(readManagedRuntimeConfigState(state)).toEqual(inner);
  });

  it("returns a plain object and rejects a non-object, null, or array", () => {
    const record = {
      [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    };

    expect(readRecord(record)).toBe(record);
    expect(() => readRecord(0)).toThrow();
    expect(() => readRecord(null)).toThrow();
    expect(() => readRecord([])).toThrow();
  });
});
