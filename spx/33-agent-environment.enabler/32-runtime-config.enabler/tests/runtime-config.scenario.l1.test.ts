import { describe, expect, it } from "vitest";

import {
  AGENT_RUNTIME,
  type AgentEnvironmentConfig,
  agentEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import {
  CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
  CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
  reconcileRuntimeConfig,
  RUNTIME_CONFIG_ACTION,
  RUNTIME_CONFIG_ERROR_MESSAGES,
  RUNTIME_CONFIG_FILE_ERROR_CODES,
  RUNTIME_CONFIG_STATE_FIELDS,
  RUNTIME_CONFIG_TARGET_KIND,
  type RuntimeConfigFileSystem,
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

class FailingWriteFileSystem implements RuntimeConfigFileSystem {
  constructor(private readonly message: string) {}

  async readFile(): Promise<string> {
    const error = new Error();
    (error as NodeJS.ErrnoException).code = RUNTIME_CONFIG_FILE_ERROR_CODES.FILE_NOT_FOUND;
    throw error;
  }

  async mkdir(): Promise<unknown> {
    return undefined;
  }

  async writeFile(): Promise<unknown> {
    throw new Error(this.message);
  }
}

describe("runtime config reconciliation scenarios", () => {
  it("reconciles existing runtime files and reruns without byte changes", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const codexField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const codexValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const claudeCodeField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const claudeCodeValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(CODEX_RUNTIME_CONFIG_RELATIVE_PATH, `${codexField} = "${codexValue}"\n`);
      await writeRaw(
        CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
        `${JSON.stringify({ [claudeCodeField]: claudeCodeValue })}\n`,
      );

      const first = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.error);
      expect(first.value.changed).toBe(true);
      expect(first.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.UPDATE,
        RUNTIME_CONFIG_ACTION.UPDATE,
      ]);

      const codexRaw = await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
      const claudeCodeRaw = await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
      const codex = readRecord(parseToml(codexRaw));
      const claudeCode = readRecord(JSON.parse(claudeCodeRaw));

      expect(codex[codexField]).toBe(codexValue);
      expect(readManagedState(codex)).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
      expect(claudeCode[claudeCodeField]).toBe(claudeCodeValue);
      expect(readManagedState(claudeCode)).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });

      const second = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error(second.error);
      expect(second.value.changed).toBe(false);
      expect(second.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.UNCHANGED,
        RUNTIME_CONFIG_ACTION.UNCHANGED,
      ]);
      expect(await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)).toBe(codexRaw);
      expect(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)).toBe(claudeCodeRaw);
    });
  });

  it("reports invalid existing runtime config before writing", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const malformedRuntimeConfig = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await writeRaw(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH, malformedRuntimeConfig);

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(RUNTIME_CONFIG_ERROR_MESSAGES.INVALID_JSON);
      }
    });
  });

  it("reports write failures as reconciliation diagnostics", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const writeFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir }) => {
      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs: new FailingWriteFileSystem(writeFailureMessage) },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(writeFailureMessage);
      }
    });
  });

  it("skips disabled runtimes without deleting or writing their runtime files", async () => {
    const agentEnvironment: AgentEnvironmentConfig = {
      ...agentEnvironmentConfigDescriptor.defaults,
      runtimes: {
        [AGENT_RUNTIME.CODEX]: { enabled: false },
        [AGENT_RUNTIME.CLAUDE_CODE]: { enabled: true },
      },
    };

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        RUNTIME_CONFIG_ACTION.CREATE,
      ]);
      await expect(readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
      expect(readManagedState(JSON.parse(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)))).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
    });
  });
});
