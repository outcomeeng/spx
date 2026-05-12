import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  lifecycleProcessRunner,
  MANAGED_SUBPROCESS_STDIO,
  type ProcessRunner,
  spawnManagedSubprocess,
} from "@/lib/process-lifecycle";
import { DEFAULT_ESLINT_CONFIG_FILE, defaultEslintProcessRunner, validateESLint } from "@/validation/steps/eslint";
import { defaultKnipProcessRunner, validateKnip } from "@/validation/steps/knip";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { defaultTypeScriptProcessRunner, validateTypeScript } from "@/validation/steps/typescript";
import { EXECUTION_MODES, type ScopeConfig, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

class RecordingValidationChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  closeSuccessfully(): void {
    this.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, VALIDATION_EXIT_CODES.SUCCESS);
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

class RecordingSpawnOptionsRunner implements ProcessRunner {
  spawnOptions: SpawnOptions | undefined;

  spawn(_command: string, _args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.spawnOptions = options;
    const child = new RecordingValidationChild();
    queueMicrotask(() => child.closeSuccessfully());
    return child.asChildProcess();
  }
}

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
    projectRoot: process.cwd(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig,
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

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

  it("ESLint subprocess output is owned by parent-owned pipes", async () => {
    const runner = new RecordingSpawnOptionsRunner();

    const result = await validateESLint(createValidationContext(), runner);

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
  });

  it("TypeScript subprocess output is owned by parent-owned pipes", async () => {
    const runner = new RecordingSpawnOptionsRunner();

    const result = await validateTypeScript(
      VALIDATION_SCOPES.FULL,
      createValidationScopeConfig(),
      undefined,
      runner,
    );

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
  });

  it("Knip subprocess output is owned by parent-owned pipes", async () => {
    const runner = new RecordingSpawnOptionsRunner();

    const result = await validateKnip(createValidationScopeConfig(), runner);

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(MANAGED_SUBPROCESS_STDIO);
  });
});
