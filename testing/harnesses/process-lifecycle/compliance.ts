/**
 * Collaborators and observations for the managed-subprocess output evidence of `spx/13-cli.enabler`.
 *
 * The harness supplies a recording `ProcessRunner` whose children emit given stdout and stderr
 * chunks, recording output adapters and stream pairs that capture what a parent forwards, the
 * validation contexts the validation steps consume, the path of the caller-owned-stdio violating
 * fixture, and the TypeScript diagnostics compiling that fixture produces. It returns observations
 * only; the linked tests own every predicate.
 *
 * @module testing/harnesses/process-lifecycle/compliance
 */
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";

import ts from "typescript";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import type { ProcessRunner } from "@/lib/process-lifecycle";
import { DEFAULT_ESLINT_CONFIG_FILE } from "@/validation/steps/eslint-contract";
import type { ValidationSubprocessOutputStreams } from "@/validation/steps/subprocess-output";
import { EXECUTION_MODES, type ScopeConfig, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import { RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

const STREAM_DATA_EVENT = "data";
const ARTIFACT_ENCODING = "utf8";

/** The text of an output artifact a runner wrote, or `undefined` when no artifact path was reported. */
export async function readOutputArtifact(path: string | undefined): Promise<string | undefined> {
  return path === undefined ? undefined : readFile(path, ARTIFACT_ENCODING);
}

/** Path of the source fixture that hands `stdio` to the managed subprocess helper, which the type system must reject. */
export const CALLER_OWNED_STDIO_FIXTURE_PATH = join(
  PRODUCT_ROOT,
  "testing/fixtures/process-lifecycle/caller-owned-stdio.ts",
);

/** A `ProcessRunner` whose every child writes the given chunks to its stdout and stderr, then closes. */
export class EmittingSpawnOptionsRunner implements ProcessRunner {
  readonly commands: string[] = [];
  readonly args: Array<readonly string[]> = [];
  readonly options: SpawnOptions[] = [];
  readonly children: RecordingValidationChild[] = [];

  constructor(
    private readonly stdoutChunk: string | undefined,
    private readonly stderrChunk: string | undefined,
    private readonly closeCodes: readonly number[] = [VALIDATION_EXIT_CODES.SUCCESS],
  ) {}

  get spawnOptions(): SpawnOptions | undefined {
    return this.options.at(-1);
  }

  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess {
    this.commands.push(command);
    this.args.push([...args]);
    this.options.push(options ?? {});
    const child = new RecordingValidationChild();
    const closeCode = this.closeCodes[this.children.length] ?? VALIDATION_EXIT_CODES.SUCCESS;
    this.children.push(child);
    setImmediate(() => {
      if (this.stdoutChunk !== undefined) child.stdout.end(this.stdoutChunk);
      else child.stdout.end();
      if (this.stderrChunk !== undefined) child.stderr.end(this.stderrChunk);
      else child.stderr.end();
      child.closeWithCode(closeCode);
    });
    return child.asChildProcess();
  }
}

/** Parent output adapters that record every chunk written to them as text. */
export interface RecordingOutputStreams {
  readonly streams: ValidationSubprocessOutputStreams;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

export function createRecordingOutputStreams(): RecordingOutputStreams {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    streams: {
      stdout: { write: (chunk) => stdout.push(Buffer.from(chunk).toString()) > 0 },
      stderr: { write: (chunk) => stderr.push(Buffer.from(chunk).toString()) > 0 },
    },
    stdout,
    stderr,
  };
}

/** A pair of writable streams that record every chunk written to them as text. */
export interface RecordingStreamPair {
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
  readonly stdoutChunks: readonly string[];
  readonly stderrChunks: readonly string[];
}

export function createRecordingStreamPair(): RecordingStreamPair {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  stdout.on(STREAM_DATA_EVENT, (chunk) => stdoutChunks.push(Buffer.from(chunk).toString()));
  stderr.on(STREAM_DATA_EVENT, (chunk) => stderrChunks.push(Buffer.from(chunk).toString()));
  return { stdout, stderr, stdoutChunks, stderrChunks };
}

/** A validation scope rooted at the directory of one generated source path. */
export function createValidationScopeConfig(): ScopeConfig {
  return {
    directories: [dirname(sampleGeneratedValue(arbitrarySourceFilePath()))],
    filePatterns: [],
    excludePatterns: [],
  };
}

/** A generated product directory a validation step runs against. */
export function createValidationProductDir(): string {
  return dirname(sampleGeneratedValue(arbitrarySourceFilePath()));
}

/** A full-scope, read-mode ESLint validation context over the product root. */
export function createValidationContext(scopeConfig: ScopeConfig = createValidationScopeConfig()): ValidationContext {
  return {
    productDir: PRODUCT_ROOT,
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig,
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

/** The diagnostics the product's TypeScript configuration reports for the source file at `path`. */
export function compileFixtureDiagnostics(path: string): readonly ts.Diagnostic[] {
  const configPath = ts.findConfigFile(PRODUCT_ROOT, ts.sys.fileExists);
  if (configPath === undefined) throw new Error("TypeScript config unavailable for process-lifecycle fixture");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, PRODUCT_ROOT);
  return ts.getPreEmitDiagnostics(ts.createProgram([path], parsed.options));
}
