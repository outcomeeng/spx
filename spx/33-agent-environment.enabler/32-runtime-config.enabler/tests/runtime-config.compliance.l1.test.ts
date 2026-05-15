import { describe, expect, it } from "vitest";

import {
  AGENT_RUNTIME,
  type AgentEnvironmentConfig,
  agentEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import {
  CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
  CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
  HERMETIC_RUNTIME_CONFIG_DIRECTORY,
  reconcileRuntimeConfig,
  RUNTIME_CONFIG_ACTION,
  RUNTIME_CONFIG_FORMAT,
  RUNTIME_CONFIG_STATE_FIELDS,
  RUNTIME_CONFIG_TARGET_KIND,
  runtimeConfigPath,
} from "@/domains/agent-environment/runtime-config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { parse as parseToml } from "smol-toml";

function enabledAgentEnvironment(): AgentEnvironmentConfig {
  return {
    ...agentEnvironmentConfigDescriptor.defaults,
    runtimes: {
      [AGENT_RUNTIME.CODEX]: { enabled: true },
      [AGENT_RUNTIME.CLAUDE_CODE]: { enabled: true },
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(value).toEqual(expect.any(Object));
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function readManagedState(value: unknown): Record<string, unknown> {
  const root = readRecord(value);
  const spx = readRecord(root[RUNTIME_CONFIG_STATE_FIELDS.SPX]);
  return readRecord(spx[RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]);
}

describe("runtime config boundary compliance", () => {
  it("models Claude Code and Codex settings as runtime-specific outputs under agent environment ownership", async () => {
    const agentEnvironment = enabledAgentEnvironment();

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.files.map((file) => [file.runtime, file.format, file.action, file.path])).toEqual([
        [
          AGENT_RUNTIME.CODEX,
          RUNTIME_CONFIG_FORMAT.TOML,
          RUNTIME_CONFIG_ACTION.CREATE,
          runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX),
        ],
        [
          AGENT_RUNTIME.CLAUDE_CODE,
          RUNTIME_CONFIG_FORMAT.JSON,
          RUNTIME_CONFIG_ACTION.CREATE,
          runtimeConfigPath(productDir, AGENT_RUNTIME.CLAUDE_CODE),
        ],
      ]);

      const codexState = readManagedState(parseToml(await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)));
      expect(codexState).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });

      const claudeCodeState = readManagedState(JSON.parse(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)));
      expect(claudeCodeState).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
    });
  });

  it("keeps invoking-agent output paths separate from hermetic execution state paths", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const stateDirName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir }) => {
      const stateDir = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX).replace(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        stateDirName,
      );
      const hermeticTarget = {
        kind: RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION,
        stateDir,
      } as const;

      const invokingPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX);
      const hermeticPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX, hermeticTarget);
      expect(hermeticPath).not.toBe(invokingPath);
      expect(hermeticPath).toContain(HERMETIC_RUNTIME_CONFIG_DIRECTORY);

      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        target: hermeticTarget,
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.target).toEqual(hermeticTarget);
      expect(result.value.files.every((file) => file.path.startsWith(stateDir))).toBe(true);
      expect(result.value.files.some((file) => file.path === invokingPath)).toBe(false);
    });
  });

  it("plans dry-run changes without writing runtime files", async () => {
    const agentEnvironment = enabledAgentEnvironment();

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment, dryRun: true });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.dryRun).toBe(true);
      expect(result.value.changed).toBe(true);
      expect(result.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.CREATE,
        RUNTIME_CONFIG_ACTION.CREATE,
      ]);
      await expect(readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
      await expect(readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
    });
  });
});
