import { readFile as readNodeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { AGENT } from "@/domains/agent-environment/config";
import {
  CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
  CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
  HERMETIC_RUNTIME_CONFIG_DIRECTORY,
  planRuntimeConfigReconciliation,
  reconcileRuntimeConfig,
  RUNTIME_CONFIG_ACTION,
  RUNTIME_CONFIG_FORMAT,
  RUNTIME_CONFIG_STATE_FIELDS,
  RUNTIME_CONFIG_TARGET_KIND,
  RUNTIME_CONFIG_TEXT_ENCODING,
  runtimeConfigPath,
} from "@/domains/agent-environment/runtime-config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  enabledHarnessEnvironment,
  readManagedRuntimeConfigState,
} from "@testing/harnesses/agent-environment/runtime-config";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { parse as parseToml } from "smol-toml";

describe("runtime config boundary compliance", () => {
  it("models Claude Code and Codex settings as agent-specific outputs under harness environment ownership", async () => {
    const harnessEnvironment = enabledHarnessEnvironment();

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await reconcileRuntimeConfig({ productDir, harnessEnvironment });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.files.map((file) => [file.runtime, file.format, file.action, file.path])).toEqual([
        [
          AGENT.CODEX,
          RUNTIME_CONFIG_FORMAT.TOML,
          RUNTIME_CONFIG_ACTION.CREATE,
          runtimeConfigPath(productDir, AGENT.CODEX),
        ],
        [
          AGENT.CLAUDE_CODE,
          RUNTIME_CONFIG_FORMAT.JSON,
          RUNTIME_CONFIG_ACTION.CREATE,
          runtimeConfigPath(productDir, AGENT.CLAUDE_CODE),
        ],
      ]);

      const codexState = readManagedRuntimeConfigState(parseToml(await readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)));
      expect(codexState).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });

      const claudeCodeState = readManagedRuntimeConfigState(
        JSON.parse(await readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)),
      );
      expect(claudeCodeState).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT.CLAUDE_CODE,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
      });
    });
  });

  it("keeps invoking-agent output paths separate from hermetic execution state paths", async () => {
    const harnessEnvironment = enabledHarnessEnvironment();
    const stateDirName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir }) => {
      const stateDir = runtimeConfigPath(productDir, AGENT.CODEX).replace(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        stateDirName,
      );
      expect(stateDir.startsWith(productDir)).toBe(true);
      const hermeticTarget = {
        kind: RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION,
        stateDir,
      } as const;

      const invokingPath = runtimeConfigPath(productDir, AGENT.CODEX);
      const hermeticPath = runtimeConfigPath(productDir, AGENT.CODEX, hermeticTarget);
      expect(hermeticPath).not.toBe(invokingPath);
      expect(hermeticPath).toContain(HERMETIC_RUNTIME_CONFIG_DIRECTORY);

      const result = await reconcileRuntimeConfig({
        productDir,
        harnessEnvironment,
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

  it("writes hermetic runtime files under the supplied state directory only", async () => {
    const harnessEnvironment = enabledHarnessEnvironment();
    const stateDirName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const stateDir = runtimeConfigPath(productDir, AGENT.CODEX).replace(
        CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
        stateDirName,
      );
      const hermeticTarget = {
        kind: RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION,
        stateDir,
      } as const;
      const hermeticCodexPath = runtimeConfigPath(productDir, AGENT.CODEX, hermeticTarget);

      const result = await reconcileRuntimeConfig({
        productDir,
        harnessEnvironment,
        target: hermeticTarget,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(
        readManagedRuntimeConfigState(parseToml(await readNodeFile(hermeticCodexPath, RUNTIME_CONFIG_TEXT_ENCODING))),
      ).toEqual({
        [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
        [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
        [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AGENT.CODEX,
        [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION,
      });
      await expect(readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
    });
  });

  it("plans runtime config changes without writing runtime files", async () => {
    const harnessEnvironment = enabledHarnessEnvironment();

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await planRuntimeConfigReconciliation({ productDir, harnessEnvironment });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.dryRun).toBe(true);
      expect(result.value.changed).toBe(true);
      expect(result.value.files.map((file) => [file.runtime, file.action, file.content !== undefined])).toEqual([
        [AGENT.CODEX, RUNTIME_CONFIG_ACTION.CREATE, true],
        [AGENT.CLAUDE_CODE, RUNTIME_CONFIG_ACTION.CREATE, true],
      ]);
      await expect(readFile(CODEX_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
      await expect(readFile(CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH)).rejects.toThrow();
    });
  });

  it("plans dry-run changes without writing runtime files", async () => {
    const harnessEnvironment = enabledHarnessEnvironment();

    await withTestEnv({}, async ({ productDir, readFile }) => {
      const result = await reconcileRuntimeConfig({ productDir, harnessEnvironment, dryRun: true });

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
