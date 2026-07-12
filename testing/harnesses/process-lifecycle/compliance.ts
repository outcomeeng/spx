import type { ChildProcess, SpawnOptions } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  createAgentRunnerDepsFor,
  createRelatedDepsFor,
  createRunnerDepsFor,
} from "@/interfaces/cli/test-runner-deps";
import { type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { validateESLint } from "@/validation/steps/eslint";
import { DEFAULT_ESLINT_CONFIG_FILE } from "@/validation/steps/eslint-contract";
import { validateFormatting } from "@/validation/steps/formatting";
import { validateKnip } from "@/validation/steps/knip";
import {
  forwardValidationSubprocessOutput,
  type ValidationSubprocessOutputStreams,
} from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { EXECUTION_MODES, type ScopeConfig, VALIDATION_SCOPES, type ValidationContext } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { RecordingSpawnOptionsRunner, RecordingValidationChild } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const CALLER_OWNED_STDIO_FIXTURE_PATH = join(
  process.cwd(),
  "testing/fixtures/process-lifecycle/caller-owned-stdio.ts",
);

class EmittingSpawnOptionsRunner implements ProcessRunner {
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

function recordingOutputStreams(stdout: string[], stderr: string[]): ValidationSubprocessOutputStreams {
  return {
    stdout: { write: (chunk) => stdout.push(Buffer.from(chunk).toString()) > 0 },
    stderr: { write: (chunk) => stderr.push(Buffer.from(chunk).toString()) > 0 },
  };
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
    productDir: process.cwd(),
    scope: VALIDATION_SCOPES.FULL,
    scopeConfig,
    mode: EXECUTION_MODES.READ,
    enabledValidations: { ESLINT: true },
    isFileSpecificMode: false,
    eslintConfigFile: DEFAULT_ESLINT_CONFIG_FILE,
  };
}

function compileFixtureDiagnostics(path: string): readonly ts.Diagnostic[] {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists);
  if (configPath === undefined) throw new Error("TypeScript config unavailable for process-lifecycle fixture");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  return ts.getPreEmitDiagnostics(ts.createProgram([path], parsed.options));
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

    it("rejects a caller-owned stdio fixture", () => {
      const diagnostics = compileFixtureDiagnostics(CALLER_OWNED_STDIO_FIXTURE_PATH);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.file?.fileName).toBe(CALLER_OWNED_STDIO_FIXTURE_PATH);
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
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdout: string[] = [];
      const stderr: string[] = [];
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);

      const result = await validateESLint(createValidationContext(), runner, recordingOutputStreams(stdout, stderr));

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(stdout).toEqual([stdoutChunk]);
      expect(stderr).toEqual([stderrChunk]);
    });

    it("TypeScript subprocess output is owned by parent-owned pipes", async () => {
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdout: string[] = [];
      const stderr: string[] = [];
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);

      const result = await validateTypeScript(
        {
          scope: VALIDATION_SCOPES.FULL,
          productDir: process.cwd(),
        },
        { runner, outputStreams: recordingOutputStreams(stdout, stderr) },
      );

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(stdout).toEqual([stdoutChunk]);
      expect(stderr).toEqual([stderrChunk]);
    });

    it("Knip subprocess output is owned by parent-owned pipes", async () => {
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdoutRunner = new EmittingSpawnOptionsRunner(
        stdoutChunk,
        undefined,
        [VALIDATION_EXIT_CODES.FAILURE],
      );
      const stderrRunner = new EmittingSpawnOptionsRunner(
        undefined,
        stderrChunk,
        [VALIDATION_EXIT_CODES.FAILURE],
      );
      const productDir = dirname(sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()));

      const stdoutResult = await validateKnip(
        { productDir, typescriptScope: createValidationScopeConfig() },
        stdoutRunner,
      );
      const stderrResult = await validateKnip(
        { productDir, typescriptScope: createValidationScopeConfig() },
        stderrRunner,
      );

      expect(stdoutResult.error).toContain(stdoutChunk);
      expect(stderrResult.error).toContain(stderrChunk);
      expect(stdoutRunner.spawnOptions).toEqual(expect.objectContaining({ cwd: productDir, stdio: "pipe" }));
      expect(stderrRunner.spawnOptions).toEqual(expect.objectContaining({ cwd: productDir, stdio: "pipe" }));
    });

    it("formatting subprocess output is owned by parent-owned pipes", async () => {
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stdout: string[] = [];
      const stderr: string[] = [];
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);

      const result = await validateFormatting(
        { productDir: process.cwd() },
        runner,
        recordingOutputStreams(stdout, stderr),
      );

      expect(result.success).toBe(true);
      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(stdout).toEqual([stdoutChunk]);
      expect(stderr).toEqual([stderrChunk]);
    });

    it("test execution subprocess output is owned by parent-owned pipes", async () => {
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
      stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk).toString()));
      stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk).toString()));
      const dependencies = createRunnerDepsFor(process.cwd(), stdout, runner, stderr)(typescriptTestingLanguage);

      await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(stdoutChunks).toEqual([stdoutChunk]);
      expect(stderrChunks).toEqual([stderrChunk]);
    });

    it("related-test subprocess output is owned by parent-owned pipes", async () => {
      const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
      const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
      const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
      const dependencies = createRelatedDepsFor(process.cwd(), runner)(typescriptTestingLanguage);

      const result = await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe("pipe");
      expect(result.stdout).toBe(stdoutChunk);
      expect(result.stderr).toBe(stderrChunk);
    });

    it("agent test subprocess output is owned by parent-owned pipes", async () => {
      await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (tmpDir) => {
        const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
        const stderrChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
        const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
        const command = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());
        const args = [sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral())];
        const dependencies = createAgentRunnerDepsFor(process.cwd(), { processRunner: runner, tmpDir })(
          typescriptTestingLanguage,
        );

        const result = await dependencies.runCommand(command, args);

        expect(runner.spawnOptions?.stdio).toBe("pipe");
        if (result.output === undefined) throw new Error("agent test runner did not report output artifacts");
        await expect(readFile(result.output.stdoutPath, "utf8")).resolves.toBe(stdoutChunk);
        await expect(readFile(result.output.stderrPath, "utf8")).resolves.toBe(stderrChunk);
      });
    });
  });
}
