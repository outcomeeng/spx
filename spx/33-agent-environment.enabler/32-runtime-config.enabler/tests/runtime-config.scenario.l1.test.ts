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

  async rm(): Promise<unknown> {
    return undefined;
  }

  async writeFile(): Promise<unknown> {
    throw new Error(this.message);
  }
}

class RuntimeConfigMemoryFileSystem implements RuntimeConfigFileSystem {
  private readonly files = new Map<string, string>();

  constructor(
    private readonly failWritePath?: string,
    private readonly failWriteMessage?: string,
    private readonly readError?: Error,
  ) {}

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  async readFile(path: string): Promise<string> {
    if (this.readError !== undefined) throw this.readError;
    const value = this.files.get(path);
    if (value === undefined) throw fileNotFoundError();
    return value;
  }

  async mkdir(): Promise<unknown> {
    return undefined;
  }

  async rm(path: string): Promise<unknown> {
    this.files.delete(path);
    return undefined;
  }

  async writeFile(path: string, content: string): Promise<unknown> {
    if (path === this.failWritePath) {
      throw new Error(this.failWriteMessage);
    }
    this.files.set(path, content);
    return undefined;
  }
}

function fileNotFoundError(): NodeJS.ErrnoException {
  const error = new Error() as NodeJS.ErrnoException;
  error.code = RUNTIME_CONFIG_FILE_ERROR_CODES.FILE_NOT_FOUND;
  return error;
}

describe("runtime config reconciliation scenarios", () => {
  it("reconciles existing runtime files and reruns without byte changes", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const codexField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const codexValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const codexComment = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const claudeCodeField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const claudeCodeValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(CODEX_RUNTIME_CONFIG_RELATIVE_PATH, `# ${codexComment}\n${codexField} = "${codexValue}"\n`);
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

      expect(codexRaw).toContain(codexComment);
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

  it("reports invalid existing Codex TOML before writing", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const malformedRuntimeConfig = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await writeRaw(CODEX_RUNTIME_CONFIG_RELATIVE_PATH, malformedRuntimeConfig);

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(RUNTIME_CONFIG_ERROR_MESSAGES.INVALID_TOML);
      }
    });
  });

  it("reports non-file-not-found read failures before writing", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const readFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const readError = new Error(readFailureMessage);

    await withTestEnv({}, async ({ productDir }) => {
      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs: new RuntimeConfigMemoryFileSystem(undefined, undefined, readError) },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(readFailureMessage);
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

  it("rolls back earlier runtime writes when a later runtime write fails", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const writeFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir }) => {
      const codexPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX);
      const claudeCodePath = runtimeConfigPath(productDir, AGENT_RUNTIME.CLAUDE_CODE);
      const fs = new RuntimeConfigMemoryFileSystem(claudeCodePath, writeFailureMessage);

      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(writeFailureMessage);
      }
      expect(fs.hasFile(codexPath)).toBe(false);
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
