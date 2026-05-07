import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  buildEslintArgs,
  DEFAULT_ESLINT_CONFIG_FILE,
  ESLINT_COMMAND_TOKENS,
  validateESLint,
} from "@/validation/steps/eslint";
import { VALIDATION_SUBPROCESS_EVENTS, type ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { EXECUTION_MODES, type ProcessRunner, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";

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
    const args = buildEslintArgs({});

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
