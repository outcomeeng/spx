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
  RUNTIME_CONFIG_TEXT_ENCODING,
  type RuntimeConfigFileSystem,
  runtimeConfigPath,
} from "@/domains/agent-environment/runtime-config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  enabledAgentEnvironment,
  readManagedRuntimeConfigState,
  readRecord,
} from "@testing/harnesses/agent-environment/runtime-config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

class FailingWriteFileSystem implements RuntimeConfigFileSystem {
  constructor(private readonly message: string) {}

  async readFile(_path: string, _encoding: BufferEncoding): Promise<string> {
    const error = new Error();
    (error as NodeJS.ErrnoException).code = RUNTIME_CONFIG_FILE_ERROR_CODES.FILE_NOT_FOUND;
    throw error;
  }

  async mkdir(_path: string, _options: { readonly recursive: true }): Promise<unknown> {
    return undefined;
  }

  async rm(_path: string, _options: { readonly force: true }): Promise<unknown> {
    return undefined;
  }

  async writeFile(_path: string, _content: string, _encoding: BufferEncoding): Promise<unknown> {
    throw new Error(this.message);
  }
}

class RuntimeConfigMemoryFileSystem implements RuntimeConfigFileSystem {
  private readonly files = new Map<string, string>();

  constructor(
    private readonly failWritePath?: string,
    private readonly failWriteMessage?: string,
    private readonly readError?: Error,
    private readonly failRemovePath?: string,
    private readonly failRemoveMessage?: string,
  ) {}

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  async readFile(path: string, _encoding: BufferEncoding): Promise<string> {
    if (this.readError !== undefined) throw this.readError;
    const value = this.files.get(path);
    if (value === undefined) throw fileNotFoundError();
    return value;
  }

  async mkdir(_path: string, _options: { readonly recursive: true }): Promise<unknown> {
    return undefined;
  }

  async rm(path: string, _options: { readonly force: true }): Promise<unknown> {
    if (path === this.failRemovePath) {
      throw new Error(this.failRemoveMessage);
    }
    this.files.delete(path);
    return undefined;
  }

  async writeFile(path: string, content: string, _encoding: BufferEncoding): Promise<unknown> {
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
      expect(readManagedRuntimeConfigState(codex)).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
      expect(claudeCode[claudeCodeField]).toBe(claudeCodeValue);
      expect(readManagedRuntimeConfigState(claudeCode)).toEqual({
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

  it("preserves Codex TOML array-of-tables entries after the managed table", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const firstTaskName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const secondTaskName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        [
          "[spx.agentEnvironment]",
          "enabled = false",
          `productDir = "${productDir}"`,
          `runtime = "${AGENT_RUNTIME.CODEX}"`,
          `targetKind = "${RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT}"`,
          "",
          "[[tasks]]",
          `name = "${firstTaskName}"`,
          "",
          "[[tasks]]",
          `name = "${secondTaskName}"`,
          "",
        ].join("\n"),
      );

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const codexRaw = await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
      const codex = readRecord(parseToml(codexRaw));
      const tasks = codex.tasks;

      expect(tasks).toEqual([
        { name: firstTaskName },
        { name: secondTaskName },
      ]);
      const managedState = {
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      };
      const managedTable = stringifyToml({
        [RUNTIME_CONFIG_STATE_FIELDS.SPX]: { [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: managedState },
      }).trimEnd();
      expect(codexRaw).toContain(`${managedTable}\n\n[[tasks]]`);
      expect(readManagedRuntimeConfigState(codex)).toEqual(managedState);
    });
  });

  it("does not split managed Codex TOML replacement at multiline array continuation values", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const taskName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const matrixField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        [
          "[spx.agentEnvironment]",
          "enabled = false",
          `productDir = "${productDir}"`,
          `runtime = "${AGENT_RUNTIME.CODEX}"`,
          `targetKind = "${RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT}"`,
          `${matrixField} = [`,
          "  [\"nested\"],",
          "]",
          "",
          "[[tasks]]",
          `name = "${taskName}"`,
          "",
        ].join("\n"),
      );

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const codexRaw = await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH);
      const codex = readRecord(parseToml(codexRaw));
      expect(codex.tasks).toEqual([{ name: taskName }]);
      const managedState = readManagedRuntimeConfigState(codex);
      expect(managedState[matrixField]).toBeUndefined();
      expect(managedState).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
    });
  });

  it("normalizes an inline Codex managed TOML assignment to the managed table", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const userField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const userValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        [
          `${RUNTIME_CONFIG_STATE_FIELDS.SPX}.${RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT} = { ${RUNTIME_CONFIG_STATE_FIELDS.ENABLED} = false, ${RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR} = "${productDir}", ${RUNTIME_CONFIG_STATE_FIELDS.RUNTIME} = "${AGENT_RUNTIME.CODEX}", ${RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND} = "${RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT}" }`,
          `${userField} = "${userValue}"`,
          "",
        ].join("\n"),
      );

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const codex = readRecord(parseToml(await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)));
      expect(codex[userField]).toBe(userValue);
      expect(readManagedRuntimeConfigState(codex)).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
    });
  });

  it("keeps Claude Code JSON unchanged when managed state is already the first key", async () => {
    const userField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const userValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const agentEnvironment: AgentEnvironmentConfig = {
      ...agentEnvironmentConfigDescriptor.defaults,
      runtimes: {
        [AGENT_RUNTIME.CODEX]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CODEX],
          enabled: false,
        },
        [AGENT_RUNTIME.CLAUDE_CODE]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CLAUDE_CODE],
          enabled: true,
        },
      },
    };

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      const existing = `${
        JSON.stringify(
          {
            [RUNTIME_CONFIG_STATE_FIELDS.SPX]: {
              [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: {
                [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
                [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
                [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
              },
            },
            [userField]: userValue,
          },
          null,
          2,
        )
      }\n`;
      await writeRaw(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH, existing);

      const result = await reconcileRuntimeConfig({ productDir, agentEnvironment });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.changed).toBe(false);
      expect(result.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        RUNTIME_CONFIG_ACTION.UNCHANGED,
      ]);
      expect(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)).toBe(existing);
    });
  });

  it("normalizes Claude Code managed state key order once and reruns unchanged", async () => {
    const userField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const userValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const spxUserField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const spxUserValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const agentEnvironment: AgentEnvironmentConfig = {
      ...agentEnvironmentConfigDescriptor.defaults,
      runtimes: {
        [AGENT_RUNTIME.CODEX]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CODEX],
          enabled: false,
        },
        [AGENT_RUNTIME.CLAUDE_CODE]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CLAUDE_CODE],
          enabled: true,
        },
      },
    };

    await withTestEnv({}, async ({ productDir, writeRaw, readFile }) => {
      await writeRaw(
        CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
        `${
          JSON.stringify(
            {
              [userField]: userValue,
              [RUNTIME_CONFIG_STATE_FIELDS.SPX]: {
                [spxUserField]: spxUserValue,
                [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: {
                  [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
                  [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
                  [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
                  [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
                },
              },
            },
            null,
            2,
          )
        }\n`,
      );

      const first = await reconcileRuntimeConfig({ productDir, agentEnvironment });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error(first.error);
      expect(first.value.changed).toBe(true);
      expect(first.value.files.map((file) => file.action)).toEqual([
        RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        RUNTIME_CONFIG_ACTION.UPDATE,
      ]);

      const normalized = await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
      const normalizedConfig = readRecord(JSON.parse(normalized));
      const spxConfig = readRecord(normalizedConfig[RUNTIME_CONFIG_STATE_FIELDS.SPX]);

      expect(normalizedConfig[userField]).toBe(userValue);
      expect(spxConfig[spxUserField]).toBe(spxUserValue);
      expect(readManagedRuntimeConfigState(normalizedConfig)).toEqual({
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
        RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        RUNTIME_CONFIG_ACTION.UNCHANGED,
      ]);
      expect(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)).toBe(normalized);
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

  it("reports write and rollback diagnostics when rollback fails", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const writeFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const rollbackFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir }) => {
      const codexPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX);
      const claudeCodePath = runtimeConfigPath(productDir, AGENT_RUNTIME.CLAUDE_CODE);
      const fs = new RuntimeConfigMemoryFileSystem(
        claudeCodePath,
        writeFailureMessage,
        undefined,
        codexPath,
        rollbackFailureMessage,
      );

      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(writeFailureMessage);
        expect(result.error).toContain(RUNTIME_CONFIG_ERROR_MESSAGES.ROLLBACK_FAILED);
        expect(result.error).toContain(rollbackFailureMessage);
      }
      expect(fs.hasFile(codexPath)).toBe(true);
    });
  });

  it("continues rolling back remaining runtime files after one rollback step fails", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const writeFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const rollbackFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir }) => {
      const codexPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX);
      const claudeCodePath = runtimeConfigPath(productDir, AGENT_RUNTIME.CLAUDE_CODE);
      const fs = new RuntimeConfigMemoryFileSystem(
        claudeCodePath,
        writeFailureMessage,
        undefined,
        claudeCodePath,
        rollbackFailureMessage,
      );

      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(writeFailureMessage);
        expect(result.error).toContain(RUNTIME_CONFIG_ERROR_MESSAGES.ROLLBACK_FAILED);
        expect(result.error).toContain(rollbackFailureMessage);
      }
      expect(fs.hasFile(codexPath)).toBe(false);
    });
  });

  it("continues restoring previous runtime file content after one restore step fails", async () => {
    const agentEnvironment = enabledAgentEnvironment();
    const originalCodex = stringifyToml({
      [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()),
    });
    const originalClaudeCode = `${
      JSON.stringify({
        [sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar()),
      })
    }\n`;
    const writeFailureMessage = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

    await withTestEnv({}, async ({ productDir }) => {
      const codexPath = runtimeConfigPath(productDir, AGENT_RUNTIME.CODEX);
      const claudeCodePath = runtimeConfigPath(productDir, AGENT_RUNTIME.CLAUDE_CODE);
      const fs = new RuntimeConfigMemoryFileSystem(claudeCodePath, writeFailureMessage);
      fs.setFile(codexPath, originalCodex);
      fs.setFile(claudeCodePath, originalClaudeCode);

      const result = await reconcileRuntimeConfig({
        productDir,
        agentEnvironment,
        deps: { fs },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH);
        expect(result.error).toContain(writeFailureMessage);
        expect(result.error).toContain(RUNTIME_CONFIG_ERROR_MESSAGES.ROLLBACK_FAILED);
      }
      await expect(fs.readFile(codexPath, RUNTIME_CONFIG_TEXT_ENCODING)).resolves.toBe(originalCodex);
    });
  });

  it("skips disabled runtimes without deleting or writing their runtime files", async () => {
    const agentEnvironment: AgentEnvironmentConfig = {
      ...agentEnvironmentConfigDescriptor.defaults,
      runtimes: {
        [AGENT_RUNTIME.CODEX]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CODEX],
          enabled: false,
        },
        [AGENT_RUNTIME.CLAUDE_CODE]: {
          ...agentEnvironmentConfigDescriptor.defaults.runtimes[AGENT_RUNTIME.CLAUDE_CODE],
          enabled: true,
        },
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
      expect(readManagedRuntimeConfigState(JSON.parse(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH))))
        .toEqual({
          [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
          [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
          [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
          [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
        });
    });
  });
});
