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
import {
  arbitraryManagedSubprocessCase,
  NODE_PARENT_PIPED_STDIO,
} from "@testing/generators/process-lifecycle/lifecycle";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import {
  CALLER_OWNED_STDIO_FIXTURE_PATH,
  compileFixtureDiagnostics,
  createRecordingOutputStreams,
  createRecordingStreamPair,
  createValidationContext,
  createValidationProductDir,
  createValidationScopeConfig,
  EmittingSpawnOptionsRunner,
  readOutputArtifact,
} from "@testing/harnesses/process-lifecycle/compliance";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("Compliance: managed subprocesses expose parent-piped stdout and stderr to parent output adapters", () => {
  it("the managed subprocess helper spawns with parent-owned pipe stdio", () => {
    const { command, args } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new RecordingSpawnOptionsRunner();

    spawnManagedSubprocess(runner, command, args, { cwd: PRODUCT_ROOT });

    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
  });

  it("rejects a call site that hands its own stdio to the managed subprocess helper", () => {
    const diagnostics = compileFixtureDiagnostics(CALLER_OWNED_STDIO_FIXTURE_PATH);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.file?.fileName).toBe(CALLER_OWNED_STDIO_FIXTURE_PATH);
  });

  it("forwards the child's stdout and stderr through the parent output adapters", () => {
    const { command, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new RecordingSpawnOptionsRunner();
    const parent = createRecordingOutputStreams();
    const child = spawnManagedSubprocess(runner, command, [], { cwd: PRODUCT_ROOT });

    forwardValidationSubprocessOutput(child, parent.streams);
    runner.children[0]?.stdout.write(stdoutChunk);
    runner.children[0]?.stderr.write(stderrChunk);

    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(parent.stdout).toEqual([stdoutChunk]);
    expect(parent.stderr).toEqual([stderrChunk]);
  });

  it("ESLint validation forwards its subprocess output through parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const parent = createRecordingOutputStreams();

    const result = await validateESLint(createValidationContext(), runner, parent.streams);

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(parent.stdout).toEqual([stdoutChunk]);
    expect(parent.stderr).toEqual([stderrChunk]);
  });

  it("TypeScript validation forwards its subprocess output through parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const parent = createRecordingOutputStreams();

    const result = await validateTypeScript(
      { scope: VALIDATION_SCOPES.FULL, productDir: PRODUCT_ROOT },
      { runner, outputStreams: parent.streams },
    );

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(parent.stdout).toEqual([stdoutChunk]);
    expect(parent.stderr).toEqual([stderrChunk]);
  });

  it("Knip validation forwards its subprocess output through parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk, [VALIDATION_EXIT_CODES.FAILURE]);
    const parent = createRecordingOutputStreams();
    const productDir = createValidationProductDir();

    const result = await validateKnip(
      { productDir, typescriptScope: createValidationScopeConfig() },
      runner,
      undefined,
      parent.streams,
    );

    expect(result.error).toContain(stdoutChunk);
    expect(runner.spawnOptions).toEqual(expect.objectContaining({ cwd: productDir, stdio: NODE_PARENT_PIPED_STDIO }));
    expect(parent.stdout).toEqual([stdoutChunk]);
    expect(parent.stderr).toEqual([stderrChunk]);
  });

  it("formatting validation forwards its subprocess output through parent-owned pipes", async () => {
    const { stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const parent = createRecordingOutputStreams();

    const result = await validateFormatting({ productDir: PRODUCT_ROOT }, runner, parent.streams);

    expect(result.success).toBe(true);
    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(parent.stdout).toEqual([stdoutChunk]);
    expect(parent.stderr).toEqual([stderrChunk]);
  });

  it("test execution forwards its subprocess output through parent-owned pipes", async () => {
    const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const parent = createRecordingStreamPair();
    const dependencies = createRunnerDepsFor(PRODUCT_ROOT, parent.stdout, runner, parent.stderr)(
      typescriptTestingLanguage,
    );

    await dependencies.runCommand(command, args);

    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(parent.stdoutChunks).toEqual([stdoutChunk]);
    expect(parent.stderrChunks).toEqual([stderrChunk]);
  });

  it("related-test execution captures its subprocess output through parent-owned pipes", async () => {
    const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
    const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
    const dependencies = createRelatedDepsFor(PRODUCT_ROOT, runner)(typescriptTestingLanguage);

    const result = await dependencies.runCommand(command, args);

    expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
    expect(result.stdout).toBe(stdoutChunk);
    expect(result.stderr).toBe(stderrChunk);
  });

  it("agent test execution writes its subprocess output to artifacts through parent-owned pipes", async () => {
    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (tmpDir) => {
      const { command, args, stdoutChunk, stderrChunk } = sampleGeneratedValue(arbitraryManagedSubprocessCase());
      const runner = new EmittingSpawnOptionsRunner(stdoutChunk, stderrChunk);
      const dependencies = createAgentRunnerDepsFor(PRODUCT_ROOT, { processRunner: runner, tmpDir })(
        typescriptTestingLanguage,
      );

      const result = await dependencies.runCommand(command, args);

      expect(runner.spawnOptions?.stdio).toBe(NODE_PARENT_PIPED_STDIO);
      expect(result.output).toBeDefined();
      await expect(readOutputArtifact(result.output?.stdoutPath)).resolves.toBe(stdoutChunk);
      await expect(readOutputArtifact(result.output?.stderrPath)).resolves.toBe(stderrChunk);
    });
  });
});
