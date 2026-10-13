import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { chmod, realpath } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { defaultLintCommandDeps, lintCommand, type LintCommandDeps } from "@/commands/validation/lint";
import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import type { LintCommandOptions } from "@/commands/validation/types";
import type { Config } from "@/config/types";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { ESLINT_PRODUCTION_CONFIG_FILES } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { validateESLint } from "@/validation/steps/eslint";
import { DEFAULT_ESLINT_CONFIG_FILE, ESLINT_LOCAL_BIN_SEGMENTS } from "@/validation/steps/eslint-contract";
import { VALIDATION_SUBPROCESS_EVENTS, type ValidationWritableStream } from "@/validation/steps/subprocess-output";
import { EXECUTION_MODES, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTestEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";

const RECORDED_ARGUMENTS_FILE = "eslint-args.txt";
const RECORDED_WORKING_DIRECTORY_FILE = "eslint-cwd.txt";
const FIXTURE_FILE_TEXT = "export default [];\n";
const EXECUTABLE_MODE = 0o755;

/** The observation an ESLint stub binary in the product's local `node_modules/.bin` records. */
export const LINT_ESLINT_STUB = {
  ARGUMENTS: "arguments",
  WORKING_DIRECTORY: "workingDirectory",
} as const;

export type LintEslintStub = (typeof LINT_ESLINT_STUB)[keyof typeof LINT_ESLINT_STUB];

const LINT_ESLINT_STUB_SCRIPTS: Record<LintEslintStub, string> = {
  [LINT_ESLINT_STUB.ARGUMENTS]: `#!/bin/sh\nprintf '%s\\n' "$@" > ${RECORDED_ARGUMENTS_FILE}\nexit 0\n`,
  [LINT_ESLINT_STUB.WORKING_DIRECTORY]: `#!/bin/sh\npwd > ${RECORDED_WORKING_DIRECTORY_FILE}\nexit 0\n`,
};

export interface LintCommandProductFile {
  readonly path: string;
  /** Serialized as the file's JSON content when present; otherwise the file holds placeholder module text. */
  readonly json?: unknown;
}

export interface LintCommandProductOptions {
  readonly config?: Config;
  readonly files: readonly LintCommandProductFile[];
  /** Spec-tree node directory names, relative to the spec-tree root, written into the product. */
  readonly nodeDirectories?: readonly string[];
  readonly stub: LintEslintStub;
  /** The command options, given the absolute product directory; `cwd` is always the product directory. */
  readonly command: (productDir: string) => Omit<LintCommandOptions, "cwd">;
}

export interface LintCommandProductObservation {
  readonly exitCode: number;
  readonly output: string;
  /** The arguments the stub received, one per line; absent when the stub never ran. */
  readonly recordedArguments: readonly string[] | undefined;
  readonly recordedWorkingDirectory: string | undefined;
  readonly productRealPath: string;
}

/**
 * Builds a product with an ESLint stub binary, runs `lintCommand` against it, and returns what the command
 * reported and what the stub recorded. The caller decides what the observation means.
 */
export function observeLintCommandOnProduct(
  options: LintCommandProductOptions,
): Promise<LintCommandProductObservation> {
  return withTestEnv(options.config ?? {}, async (env) => {
    for (const directory of options.nodeDirectories ?? []) {
      await writeOrderedDirectory(env, directory);
    }
    for (const file of options.files) {
      await env.writeRaw(file.path, file.json === undefined ? FIXTURE_FILE_TEXT : JSON.stringify(file.json));
    }
    const stubPath = join(...ESLINT_LOCAL_BIN_SEGMENTS);
    await env.writeRaw(stubPath, LINT_ESLINT_STUB_SCRIPTS[options.stub]);
    await chmod(join(env.productDir, stubPath), EXECUTABLE_MODE);

    const result = await lintCommand({ ...options.command(env.productDir), cwd: env.productDir });

    return {
      exitCode: result.exitCode,
      output: result.output,
      recordedArguments: existsSync(join(env.productDir, RECORDED_ARGUMENTS_FILE))
        ? (await env.readFile(RECORDED_ARGUMENTS_FILE)).trim().split("\n")
        : undefined,
      recordedWorkingDirectory: existsSync(join(env.productDir, RECORDED_WORKING_DIRECTORY_FILE))
        ? (await env.readFile(RECORDED_WORKING_DIRECTORY_FILE)).trim()
        : undefined,
      productRealPath: await realpath(env.productDir),
    };
  });
}

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
    productDir: process.cwd(),
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

export interface EslintOutputForwardingObservation {
  readonly success: boolean;
  readonly stdoutChunks: readonly string[];
  readonly stderrChunks: readonly string[];
}

/** Runs `validateESLint` against a runner that writes `stdoutChunk` to its stdout, with injected parent streams. */
export async function observeEslintOutputForwarding(stdoutChunk: string): Promise<EslintOutputForwardingObservation> {
  const stdout = new RecordingWritable();
  const stderr = new RecordingWritable();

  const result = await validateESLint(
    createValidationContext(),
    new OutputRunner(stdoutChunk),
    { stdout, stderr },
  );

  return { success: result.success, stdoutChunks: stdout.chunks, stderrChunks: stderr.chunks };
}

export interface ReportedConfigObservation {
  readonly exitCode: number;
  readonly receivedEslintConfigFile: string | undefined;
}

/** Runs the production-scope lint command against language detection that reports a production ESLint config. */
export function observeLintWithReportedProductionConfig(): Promise<ReportedConfigObservation> {
  return withTestEnv({}, async (env) => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const toolPath = join(env.productDir, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
    let receivedContext: ValidationContext | undefined;
    const deps: LintCommandDeps = {
      ...defaultLintCommandDeps,
      detectTypeScript: () => ({
        present: true,
        eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
        productionEslintConfigFile: ESLINT_PRODUCTION_CONFIG_FILES[0],
      }),
      discoverTool: async (tool) => ({
        found: true,
        location: { tool, path: toolPath, source: TOOL_DISCOVERY.SOURCES.GLOBAL },
      }),
      validateESLint: async (context) => {
        receivedContext = context;
        return { success: true };
      },
    };
    await env.writeRaw(TSCONFIG_FILES.full, JSON.stringify({ include: [sourceFilePath] }));
    await env.writeRaw(sourceFilePath, FIXTURE_FILE_TEXT);

    const result = await lintCommand({ cwd: env.productDir, scope: VALIDATION_SCOPES.PRODUCTION, quiet: true }, deps);

    return { exitCode: result.exitCode, receivedEslintConfigFile: receivedContext?.eslintConfigFile };
  });
}

export interface ConsecutiveLintObservation {
  /** The executable discovery returned. */
  readonly discoveredToolPath: string;
  /** The flat config file language detection reported to the lint command. */
  readonly reportedConfigFile: string;
  /** The file the caller asked the lint command to validate. */
  readonly callerFile: string;
  /** The close code each spawned child emitted, in spawn order. */
  readonly childCloseCodes: readonly number[];
  /** The exit code each lint invocation returned, in invocation order. */
  readonly exitCodes: readonly number[];
  /** The executable each lint invocation spawned, in order. */
  readonly spawnedCommands: readonly string[];
  /** The argument vector each lint invocation spawned its executable with, in order. */
  readonly spawnedArguments: ReadonlyArray<readonly string[]>;
}

/**
 * Runs the lint command twice against a recording spawn runner whose first child closes successfully and
 * whose second child closes with a failure, and returns what was spawned and what each invocation returned.
 */
export function observeConsecutiveLintInvocations(): Promise<ConsecutiveLintObservation> {
  return withTestEnv({}, async (env) => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const toolPath = join(env.productDir, sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));
    const childCloseCodes = [VALIDATION_EXIT_CODES.SUCCESS, VALIDATION_EXIT_CODES.FAILURE];
    const runner = new RecordingSpawnOptionsRunner(childCloseCodes);
    const deps: LintCommandDeps = {
      ...defaultLintCommandDeps,
      discoverTool: async (tool) => ({
        found: true,
        location: { tool, path: toolPath, source: TOOL_DISCOVERY.SOURCES.GLOBAL },
      }),
      validateESLint: (context, _runner, outputStreams) => validateESLint(context, runner, outputStreams),
    };
    await env.writeRaw("tsconfig.json", JSON.stringify({ include: [sourceFilePath] }));
    await env.writeRaw(DEFAULT_ESLINT_CONFIG_FILE, FIXTURE_FILE_TEXT);
    await env.writeRaw(sourceFilePath, FIXTURE_FILE_TEXT);

    const first = await lintCommand({ cwd: env.productDir, files: [sourceFilePath], quiet: true }, deps);
    const second = await lintCommand({ cwd: env.productDir, files: [sourceFilePath], quiet: true }, deps);

    return {
      discoveredToolPath: toolPath,
      reportedConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
      callerFile: sourceFilePath,
      childCloseCodes,
      exitCodes: [first.exitCode, second.exitCode],
      spawnedCommands: runner.commands,
      spawnedArguments: runner.args,
    };
  });
}

export interface LintPreflightDetection {
  /** The language detection result the lint command receives. */
  readonly detection: { readonly present: false } | { readonly present: true };
  /** Whether the lint command runs with its quiet option. */
  readonly quiet: boolean;
}

export interface LintPreflightObservation {
  readonly exitCode: number;
  readonly output: string;
  readonly detectionCalls: number;
  /** Calls made to tool discovery, config resolution, and the ESLint subprocess step together. */
  readonly downstreamCalls: number;
}

/** Runs the lint command against a detection result and collaborators that count their calls and return continuable values. */
export async function observeLintPreflight(preflight: LintPreflightDetection): Promise<LintPreflightObservation> {
  let detectionCalls = 0;
  let downstreamCalls = 0;
  const result = await lintCommand(
    { cwd: process.cwd(), quiet: preflight.quiet },
    {
      detectTypeScript: () => {
        detectionCalls += 1;
        return preflight.detection;
      },
      discoverTool: async (tool) => {
        downstreamCalls += 1;
        return {
          found: true,
          location: { tool, path: process.cwd(), source: TOOL_DISCOVERY.SOURCES.GLOBAL },
        };
      },
      resolveConfig: async () => {
        downstreamCalls += 1;
        return { ok: false, error: VALIDATION_COMMAND_OUTPUT.ESLINT_FAILURE };
      },
      validateESLint: async () => {
        downstreamCalls += 1;
        return { success: true, duration: 0 };
      },
    },
  );

  return { exitCode: result.exitCode, output: result.output, detectionCalls, downstreamCalls };
}
