import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmod, realpath } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { lintCommand } from "@/commands/validation/lint";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import {
  buildEslintArgs,
  DEFAULT_ESLINT_CONFIG_FILE,
  ESLINT_COMMAND_TOKENS,
  ESLINT_EMPTY_PRODUCTION_SCOPE_ERROR,
  ESLINT_LOCAL_BIN_SEGMENTS,
  validateESLint,
} from "@/validation/steps/eslint";
import { VALIDATION_SUBPROCESS_EVENTS, type ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { EXECUTION_MODES, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

class RecordingWritable implements ValidationWritableStream {
  readonly chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk).toString());
    return true;
  }
}

class RecordingEslintChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

class OutputRunner implements ProcessRunner {
  constructor(private readonly stdoutChunk: string) {}

  spawn(_command: string, _args: readonly string[], _options?: SpawnOptions): ChildProcess {
    const child = new RecordingEslintChild();
    queueMicrotask(() => {
      child.stdout.write(this.stdoutChunk);
      child.emit(VALIDATION_SUBPROCESS_EVENTS.CLOSE, VALIDATION_EXIT_CODES.SUCCESS);
    });
    return child.asChildProcess();
  }
}

function createValidationContext(): ValidationContext {
  return {
    projectRoot: process.cwd(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig: {
      directories: [],
      excludePatterns: [],
      filePatterns: [],
    },
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

describe("ESLint command arguments", () => {
  it("passes project lint through without injected policy arguments", () => {
    const args = buildEslintArgs({ scope: VALIDATION_SCOPES.FULL });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("passes scoped file lint through without injected policy arguments", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("lets explicit file scope take precedence over production scope", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through as the only optional ESLint behavior flag", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      mode: EXECUTION_MODES.WRITE,
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
    ]);
  });

  it("passes production scope patterns as ESLint targets without process environment state", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("rejects production scope without TypeScript file patterns", () => {
    const build = () =>
      buildEslintArgs({
        scope: VALIDATION_SCOPES.PRODUCTION,
        scopeConfig: {
          directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
          excludePatterns: [],
          filePatterns: [],
        },
      });

    expect(build).toThrow(ESLINT_EMPTY_PRODUCTION_SCOPE_ERROR);
  });

  it("runs lint command from the requested project root", async () => {
    await withTestEnv({}, async (env) => {
      await env.writeRaw(
        "tsconfig.json",
        JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
      );
      await env.writeRaw("eslint.config.ts", "export default [];\n");
      await env.writeRaw("src/index.ts", "export const lintCommandProjectRoot = 1;\n");
      await env.writeRaw(join(...ESLINT_LOCAL_BIN_SEGMENTS), "#!/bin/sh\npwd > eslint-cwd.txt\nexit 0\n");
      await chmod(join(env.projectDir, ...ESLINT_LOCAL_BIN_SEGMENTS), 0o755);

      const result = await lintCommand({ cwd: env.projectDir, quiet: true });

      expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect((await env.readFile("eslint-cwd.txt")).trim()).toBe(await realpath(env.projectDir));
    });
  });

  it("forwards ESLint subprocess output through injected parent streams", async () => {
    const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
    const stdout = new RecordingWritable();
    const stderr = new RecordingWritable();

    const result = await validateESLint(
      createValidationContext(),
      new OutputRunner(stdoutChunk),
      { stdout, stderr },
    );

    expect(result.success).toBe(true);
    expect(stdout.chunks).toEqual([stdoutChunk]);
    expect(stderr.chunks).toEqual([]);
  });
});
