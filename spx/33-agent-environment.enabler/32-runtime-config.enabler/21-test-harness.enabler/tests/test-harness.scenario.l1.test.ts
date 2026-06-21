import { describe, expect, it } from "vitest";

import { AGENT_RUNTIME } from "@/domains/agent-environment/config";
import { RUNTIME_CONFIG_STATE_FIELDS } from "@/domains/agent-environment/runtime-config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  enabledAgentEnvironment,
  readManagedRuntimeConfigState,
  readRecord,
} from "@testing/harnesses/agent-environment/runtime-config";

describe("runtime-config test harness", () => {
  it("enables both runtimes over the descriptor defaults", () => {
    const config = enabledAgentEnvironment();

    expect(config.runtimes[AGENT_RUNTIME.CODEX]?.enabled).toBe(true);
    expect(config.runtimes[AGENT_RUNTIME.CLAUDE_CODE]?.enabled).toBe(true);
  });

  it("navigates the managed agent-environment record out of a parsed state", () => {
    const innerKey = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const innerValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const inner = { [innerKey]: innerValue };
    const state = {
      [RUNTIME_CONFIG_STATE_FIELDS.SPX]: { [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: inner },
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
