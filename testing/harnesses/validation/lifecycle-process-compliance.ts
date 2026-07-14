import type { SpawnOptions } from "node:child_process";
import { dirname } from "node:path";

import {
  lifecycleProcessRunner,
  MANAGED_SUBPROCESS_STDIO,
  type ManagedSubprocessSpawnOptions,
  spawnManagedSubprocess,
} from "@/lib/process-lifecycle";
import { DEFAULT_ESLINT_CONFIG_FILE, defaultEslintProcessRunner, validateESLint } from "@/validation/steps/eslint";
import { defaultKnipProcessRunner, validateKnip } from "@/validation/steps/knip";
import { defaultTypeScriptProcessRunner, validateTypeScript } from "@/validation/steps/typescript";
import { EXECUTION_MODES, type ScopeConfig, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

function createValidationScopeConfig(): ScopeConfig {
  const sourcePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

  return {
    directories: [dirname(sourcePath)],
    filePatterns: [],
    excludePatterns: [],
  };
}

function createValidationContext(scopeConfig: ScopeConfig = createValidationScopeConfig()): ValidationContext {
  return {
    productDir: process.cwd(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig,
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

// Compile-time fixture: accepting options through this function proves the
// ManagedSubprocessSpawnOptions type, not runtime behavior.
function requireManagedSubprocessOptions(options: ManagedSubprocessSpawnOptions): ManagedSubprocessSpawnOptions {
  return options;
}

export function registerLifecycleProcessCompliance(): void {
  describe("Compliance: validation step ProcessRunner defaults reference lifecycleProcessRunner", () => {
    it("defaultEslintProcessRunner is the shared lifecycleProcessRunner", () => {
      expect(defaultEslintProcessRunner).toBe(lifecycleProcessRunner);
    });

    it("defaultTypeScriptProcessRunner is the shared lifecycleProcessRunner", () => {
      expect(defaultTypeScriptProcessRunner).toBe(lifecycleProcessRunner);
    });

    it("defaultKnipProcessRunner is the shared lifecycleProcessRunner", () => {
      expect(defaultKnipProcessRunner).toBe(lifecycleProcessRunner);
    });

    it("managed subprocess helper owns parent-owned pipe stdio", () => {
      const runner = new RecordingSpawnOptionsRunner();
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];

      spawnManagedSubprocess(runner, command, args, { cwd: process.cwd() });

      expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
    });

    it("managed subprocess options reject caller-owned stdio", () => {
      const callerOwnedStdioOptions: SpawnOptions = { stdio: [process.stdin, process.stdout, process.stderr] };

      // @ts-expect-error - Managed subprocess options reject caller-owned stdio even through SpawnOptions variables.
      const rejectedOptions = requireManagedSubprocessOptions(callerOwnedStdioOptions);
      expect(rejectedOptions.stdio).toBeDefined();
    });

    it("ESLint subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateESLint(createValidationContext(), runner);

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
    });

    it("TypeScript subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          productDir: process.cwd(),
        },
        { runner },
      );

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
    });

    it("Knip subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();
      const productDir = dirname(sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));

      const result = await validateKnip({ productDir, typescriptScope: createValidationScopeConfig() }, runner);

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.cwd).toBe(productDir);
      expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
    });
  });
}

export const lifecycleProcessComplianceCases = collectHarnessTestCases(registerLifecycleProcessCompliance);
