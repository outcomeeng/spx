import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  createAgentRunnerDepsFor,
  createRelatedDepsFor,
  createRunnerDepsFor,
} from "@/interfaces/cli/test-runner-deps";
import { spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { validateESLint } from "@/validation/steps/eslint";
import { validateFormatting } from "@/validation/steps/formatting";
import { validateKnip } from "@/validation/steps/knip";
import { forwardValidationSubprocessOutput } from "@/validation/steps/subprocess-output";
import { validateTypeScript } from "@/validation/steps/typescript";
import { VALIDATION_SCOPES } from "@/validation/types";
import { arbitraryManagedSubprocessCase, STDIO_ORACLE } from "@testing/generators/process-lifecycle/lifecycle";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  CALLER_OWNED_STDIO_FIXTURE_PATH,
  compileFixtureDiagnostics,
  createRecordingOutputStreams,
  createStreamCapture,
  createValidationContext,
  createValidationScopeConfig,
  EmittingSpawnOptionsRunner,
  managedSubprocessProductDir,
  readOutputArtifact,
} from "@testing/harnesses/process-lifecycle/managed-subprocess";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("Compliance: managed subprocess output", () => {
  it("managed subprocess helper owns parent-owned pipe stdio", () => {
    const { command, args } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new RecordingSpawnOptionsRunner();

    spawnManagedSubprocess(runner, command, args, { cwd: managedSubprocessProductDir() });

    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
  });

  it("refuses a caller-owned stdio call site at compile time", () => {
    const diagnostics = compileFixtureDiagnostics(CALLER_OWNED_STDIO_FIXTURE_PATH);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.file?.fileName).toBe(CALLER_OWNED_STDIO_FIXTURE_PATH);
  });

  it("forwards child stdout and stderr through parent output adapters", () => {
    const { command, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new RecordingSpawnOptionsRunner();
    const output = createRecordingOutputStreams();
    const child = spawnManagedSubprocess(runner, command, [], { cwd: managedSubprocessProductDir() });

    forwardValidationSubprocessOutput(child, output.streams);
    runner.children[0]?.stdout.write(stdoutChunk);
    runner.children[0]?.stderr.write(stderrChunk);

    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(output.stdout).toEqual([stdoutChunk]);
    expect(output.stderr).toEqual([stderrChunk]);
  });

  it("ESLint subprocess output is owned by parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk, productDir } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const output = createRecordingOutputStreams();

    const result = await validateESLint(
      createValidationContext(createValidationScopeConfig(productDir)),
      runner,
      output.streams,
    );

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(output.stdout).toEqual([stdoutChunk]);
    expect(output.stderr).toEqual([stderrChunk]);
  });

  it("TypeScript subprocess output is owned by parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const output = createRecordingOutputStreams();

    const result = await validateTypeScript(
      { scope: VALIDATION_SCOPES.FULL, productDir: managedSubprocessProductDir() },
      { runner, outputStreams: output.streams },
    );

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(output.stdout).toEqual([stdoutChunk]);
    expect(output.stderr).toEqual([stderrChunk]);
  });

  it("Knip subprocess output is owned by parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk, productDir } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk, [VALIDATION_EXIT_CODES.FAILURE]);
    const output = createRecordingOutputStreams();

    const result = await validateKnip(
      { productDir, typescriptScope: createValidationScopeConfig(productDir) },
      runner,
      undefined,
      output.streams,
    );

    expect(result.error).toContain(stdoutChunk);
    expect(runner.spawnOptions).toEqual(expect.objectContaining({ cwd: productDir, stdio: STDIO_ORACLE.PARENT_PIPE }));
    expect(output.stdout).toEqual([stdoutChunk]);
    expect(output.stderr).toEqual([stderrChunk]);
  });

  it("formatting subprocess output is owned by parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const output = createRecordingOutputStreams();

    const result = await validateFormatting({ productDir: managedSubprocessProductDir() }, runner, output.streams);

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(output.stdout).toEqual([stdoutChunk]);
    expect(output.stderr).toEqual([stderrChunk]);
  });

  it("test execution subprocess output is owned by parent-owned pipes", async () => {
    const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const stdout = createStreamCapture();
    const stderr = createStreamCapture();
    const dependencies = createRunnerDepsFor(managedSubprocessProductDir(), stdout.stream, runner, stderr.stream)(
      typescriptTestingLanguage,
    );

    await dependencies.runCommand(command, args);

    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(stdout.chunks).toEqual([stdoutChunk]);
    expect(stderr.chunks).toEqual([stderrChunk]);
  });

  it("related-test subprocess output is owned by parent-owned pipes", async () => {
    const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const dependencies = createRelatedDepsFor(managedSubprocessProductDir(), runner)(typescriptTestingLanguage);

    const result = await dependencies.runCommand(command, args);

    expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
    expect(result.stdout).toBe(stdoutChunk);
    expect(result.stderr).toBe(stderrChunk);
  });

  it("agent test subprocess output is owned by parent-owned pipes", async () => {
    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (tmpDir) => {
      const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
      const dependencies = createAgentRunnerDepsFor(managedSubprocessProductDir(), { processRunner: runner, tmpDir })(
        typescriptTestingLanguage,
      );

      const result = await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe(STDIO_ORACLE.PARENT_PIPE);
      expect(result.output).toBeDefined();
      await expect(readOutputArtifact(result.output?.stdoutPath ?? "")).resolves.toBe(stdoutChunk);
      await expect(readOutputArtifact(result.output?.stderrPath ?? "")).resolves.toBe(stderrChunk);
    });
  });
});
