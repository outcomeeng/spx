import type { SpawnOptions } from "node:child_process";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  AGENT_ARTIFACT_DIR_PREFIX,
  createAgentRunnerDepsFor,
  createRelatedDepsFor,
  createRunnerDepsFor,
} from "@/interfaces/cli/test-runner-deps";
import { type ManagedSubprocessSpawnOptions, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { DEFAULT_ESLINT_CONFIG_FILE, validateESLint } from "@/validation/steps/eslint";
import { validateFormatting } from "@/validation/steps/formatting";
import { validateKnip } from "@/validation/steps/knip";
import { forwardValidationSubprocessOutput } from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { EXECUTION_MODES, type ScopeConfig, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

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

export function registerLifecycleComplianceEvidence(): void {
  describe("Compliance: managed subprocess output", () => {
    it("managed subprocess helper owns parent-owned pipe stdio", () => {
      const runner = new RecordingSpawnOptionsRunner();
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];

      spawnManagedSubprocess(runner, command, args, { cwd: process.cwd() });

      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("managed subprocess options reject caller-owned stdio", () => {
      const callerOwnedStdioOptions: SpawnOptions = { stdio: [process.stdin, process.stdout, process.stderr] };

      // @ts-expect-error - Managed subprocess options reject caller-owned stdio even through SpawnOptions variables.
      const rejectedOptions = requireManagedSubprocessOptions(callerOwnedStdioOptions);
      expect(rejectedOptions.stdio).toBeDefined();
    });

    it("forwards child stdout and stderr through parent output adapters", () => {
      const runner = new RecordingSpawnOptionsRunner();
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdout: Array<string | Uint8Array> = [];
      const stderr: Array<string | Uint8Array> = [];
      const child = spawnManagedSubprocess(runner, command, [], { cwd: process.cwd() });

      forwardValidationSubprocessOutput(child, {
        stdout: { write: (chunk) => stdout.push(chunk) > 0 },
        stderr: { write: (chunk) => stderr.push(chunk) > 0 },
      });
      runner.children[0]?.stdout.write(stdoutChunk);
      runner.children[0]?.stderr.write(stderrChunk);

      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(stdout.map(String)).toEqual([stdoutChunk]);
      expect(stderr.map(String)).toEqual([stderrChunk]);
    });

    it("ESLint subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateESLint(createValidationContext(), runner);

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
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
      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("Knip subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();
      const productDir = dirname(sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));

      const result = await validateKnip({ productDir, typescriptScope: createValidationScopeConfig() }, runner);

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.cwd).toBe(productDir);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("formatting subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();

      const result = await validateFormatting({ productDir: process.cwd() }, runner);

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("test execution subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
      const dependencies = createRunnerDepsFor(process.cwd(), new PassThrough(), runner)(typescriptTestingLanguage);

      await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("related-test subprocess output is owned by parent-owned pipes", async () => {
      const runner = new RecordingSpawnOptionsRunner();
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
      const dependencies = createRelatedDepsFor(process.cwd(), runner)(typescriptTestingLanguage);

      await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe("pipe");
    });

    it("agent test subprocess output is owned by parent-owned pipes", async () => {
      await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (tmpDir) => {
        const runner = new RecordingSpawnOptionsRunner();
        const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
        const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
        const dependencies = createAgentRunnerDepsFor(process.cwd(), { processRunner: runner, tmpDir })(
          typescriptTestingLanguage,
        );

        await dependencies.runCommand(command, args);

        expect(runner.spawnOptions?.stdio).toBe("pipe");
      });
    });
  });
}
