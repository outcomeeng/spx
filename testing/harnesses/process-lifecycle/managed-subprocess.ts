/**
 * Managed-subprocess harness for the process-lifecycle compliance evidence.
 *
 * Supplies the controlled process runner that emits configured stdout and stderr
 * bytes, the recording output adapters a domain runner forwards into, the
 * validation context the validation steps run under, and the TypeScript compile
 * probe that type-checks a caller-owned-stdio source fixture. It returns runners,
 * buffers, and diagnostics; every predicate stays in the linked test.
 *
 * @module testing/harnesses/process-lifecycle/managed-subprocess
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
import { RecordingValidationChild } from "@testing/harnesses/validation/subprocess";

/** The product directory the harness runs validation steps and runners against. */
export function managedSubprocessProductDir(): string {
  return process.cwd();
}

/** A source fixture whose call site sets `stdio` on the managed helper, which the helper's type must refuse. */
export const CALLER_OWNED_STDIO_FIXTURE_PATH = join(
  managedSubprocessProductDir(),
  "testing/fixtures/process-lifecycle/caller-owned-stdio.ts",
);

/**
 * A process runner whose every child writes the configured stdout and stderr bytes on the
 * next tick, then closes with the next configured code, recording each spawn request.
 */
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

/** Parent output adapters that record every chunk forwarded to them, decoded as text. */
export interface RecordingOutputStreams {
  readonly streams: ValidationSubprocessOutputStreams;
  readonly stdout: string[];
  readonly stderr: string[];
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

/** A writable stream paired with the text chunks written to it. */
export interface StreamCapture {
  readonly stream: PassThrough;
  readonly chunks: string[];
}

export function createStreamCapture(): StreamCapture {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk).toString()));
  return { stream, chunks };
}

/** A validation scope rooted at the directory of the given source path. */
export function createValidationScopeConfig(productDir: string): ScopeConfig {
  return {
    directories: [productDir],
    filePatterns: [],
    excludePatterns: [],
  };
}

/** A full-scope, read-mode ESLint validation context over the given scope. */
export function createValidationContext(scopeConfig: ScopeConfig): ValidationContext {
  return {
    productDir: managedSubprocessProductDir(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig,
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

/** Type-checks one source file under the product's TypeScript configuration and returns its diagnostics. */
export function compileFixtureDiagnostics(path: string): readonly ts.Diagnostic[] {
  const productDir = managedSubprocessProductDir();
  const configPath = ts.findConfigFile(productDir, ts.sys.fileExists);
  if (configPath === undefined) throw new Error("TypeScript config unavailable for process-lifecycle fixture");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  return ts.getPreEmitDiagnostics(ts.createProgram([path], parsed.options));
}

/** Reads an output artifact a runner wrote, decoded as UTF-8 text. */
export function readOutputArtifact(path: string): Promise<string> {
  return readFile(path, "utf8");
}
