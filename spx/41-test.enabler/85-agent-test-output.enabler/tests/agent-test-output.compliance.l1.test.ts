import { readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import {
  AGENT_TEST_ARTIFACTS_DIR_NAME,
  createAgentOutputCommandRunner,
  PROCESS_FAILURE_EXIT_CODE,
} from "@/interfaces/cli/test-runner-deps";
import { STATE_STORE_DOMAIN, worktreeScopeDir } from "@/lib/state-store";
import {
  artifactListingSpawnRunner,
  artifactWriteFailureOptions,
  nodeOutputCommand,
  observeChildStreamsOffTerminal,
  observeUserTempFolderDuring,
  type RecordedProcessSpawn,
  recordingSpawnRunner,
  sampleChildOutputCase,
  sampleRunnerOperands,
  withAgentOutputProduct,
} from "@testing/harnesses/testing/agent-test-output";

describe("agent test-output runner", () => {
  it("does not expose child-process helper constants on the production dependency surface", async () => {
    const runnerDeps = await import("@/interfaces/cli/test-runner-deps");

    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_COMMAND");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_PROCESS_EVENT");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_STREAM_METHOD");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_TEXT_ENCODING");
  });

  it("defers artifact directory creation until a runner command executes", async () => {
    await withAgentOutputProduct(async (productDir) => {
      createAgentOutputCommandRunner(productDir);

      expect(await readdir(productDir)).toEqual([]);
    });
  });

  it("creates the artifact directory when a runner command executes", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const runCommand = createAgentOutputCommandRunner(productDir, { env: { [output.envKey]: output.envValue } });

      await runCommand(command, args);

      expect(await readdir(join(worktreeScopeDir(productDir), STATE_STORE_DOMAIN.TEST, AGENT_TEST_ARTIFACTS_DIR_NAME)))
        .toHaveLength(2);
    });
  });

  it("writes child stdout and stderr under the worktree artifacts directory and returns those paths", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const runCommand = createAgentOutputCommandRunner(productDir, { env: { [output.envKey]: output.envValue } });

      const result = await runCommand(command, args);

      const returned = result.output;
      if (returned === undefined) throw new Error("Expected the runner result to carry artifact paths");
      const artifactsDir = join(worktreeScopeDir(productDir), STATE_STORE_DOMAIN.TEST, AGENT_TEST_ARTIFACTS_DIR_NAME);
      expect(dirname(returned.stdoutPath)).toBe(artifactsDir);
      expect(dirname(returned.stderrPath)).toBe(artifactsDir);
      expect(returned.stdoutPath).not.toBe(returned.stderrPath);
      const entries = await readdir(artifactsDir);
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(expect.arrayContaining([basename(returned.stdoutPath), basename(returned.stderrPath)]));
    });
  });

  it("captures stdout and stderr contents while preserving the child env and the product directory as cwd", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const runCommand = createAgentOutputCommandRunner(productDir, { env: { [output.envKey]: output.envValue } });

      const result = await runCommand(command, args);

      const returned = result.output;
      if (returned === undefined) throw new Error("Expected the runner result to carry artifact paths");
      expect(String(await readFile(returned.stdoutPath))).toBe(
        `${output.stdoutContent}${await realpath(productDir)}`,
      );
      expect(String(await readFile(returned.stderrPath))).toBe(`${output.stderrContent}${output.envValue}`);
    });
  });

  it("replaces the previous run's artifacts before the first runner command starts", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const env = { [output.envKey]: output.envValue };
      const artifactsDir = join(worktreeScopeDir(productDir), STATE_STORE_DOMAIN.TEST, AGENT_TEST_ARTIFACTS_DIR_NAME);
      const previousRun = createAgentOutputCommandRunner(productDir, { env });
      await previousRun(command, args);
      const previousSecond = await previousRun(command, args);
      const previousSecondOutput = previousSecond.output;
      if (previousSecondOutput === undefined) throw new Error("Expected the previous run to carry artifact paths");
      const operands = sampleRunnerOperands();
      const listingsAtSpawn: string[][] = [];
      const latestRun = createAgentOutputCommandRunner(productDir, {
        env,
        processRunner: artifactListingSpawnRunner(artifactsDir, listingsAtSpawn),
      });

      const latest = await latestRun(operands.command, [operands.arg]);

      const latestOutput = latest.output;
      if (latestOutput === undefined) throw new Error("Expected the latest run to carry artifact paths");
      const latestNames = [basename(latestOutput.stdoutPath), basename(latestOutput.stderrPath)];
      expect(listingsAtSpawn).toHaveLength(1);
      expect(listingsAtSpawn[0]).not.toContain(basename(previousSecondOutput.stdoutPath));
      expect(listingsAtSpawn[0]).not.toContain(basename(previousSecondOutput.stderrPath));
      const remaining = await readdir(artifactsDir);
      expect(remaining).toHaveLength(latestNames.length);
      expect(remaining).toEqual(expect.arrayContaining(latestNames));
    });
  });

  it("leaves the previous run's artifacts in place when a run executes no runner command", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const artifactsDir = join(worktreeScopeDir(productDir), STATE_STORE_DOMAIN.TEST, AGENT_TEST_ARTIFACTS_DIR_NAME);
      const previousRun = createAgentOutputCommandRunner(productDir, { env: { [output.envKey]: output.envValue } });
      await previousRun(command, args);
      const before = await readdir(artifactsDir);

      createAgentOutputCommandRunner(productDir, { env: { [output.envKey]: output.envValue } });

      const after = await readdir(artifactsDir);
      expect(after).toHaveLength(before.length);
      expect(after).toEqual(expect.arrayContaining(before));
    });
  });

  it("writes no artifact under the user temp folder", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const { command, args } = nodeOutputCommand(output);
      const env = { [output.envKey]: output.envValue };
      const exitCodes: number[] = [];

      const userTempEntries = await observeUserTempFolderDuring(async () => {
        const firstRun = createAgentOutputCommandRunner(productDir, { env });
        const replacingRun = createAgentOutputCommandRunner(productDir, { env });
        exitCodes.push(
          (await firstRun(command, args)).exitCode,
          (await firstRun(command, args)).exitCode,
          (await replacingRun(command, args)).exitCode,
        );
      });

      expect(exitCodes).toEqual([SUCCESS_EXIT_CODE, SUCCESS_EXIT_CODE, SUCCESS_EXIT_CODE]);
      expect(userTempEntries).toEqual([]);
    });
  });

  it("preserves the selected runner command and arguments in agent mode", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const operands = sampleRunnerOperands();
      const calls: RecordedProcessSpawn[] = [];
      const runCommand = createAgentOutputCommandRunner(productDir, {
        processRunner: recordingSpawnRunner(calls),
        env: { [output.envKey]: output.envValue },
      });

      const result = await runCommand(operands.command, [operands.arg]);

      expect(result.exitCode).toBe(SUCCESS_EXIT_CODE);
      expect(calls).toEqual([{
        command: operands.command,
        args: [operands.arg],
        env: { [output.envKey]: output.envValue },
      }]);
    });
  });

  it("fails without artifact paths when artifact writing fails", async () => {
    await withAgentOutputProduct(async (productDir) => {
      const output = sampleChildOutputCase();
      const operands = sampleRunnerOperands();
      const runCommand = createAgentOutputCommandRunner(productDir, artifactWriteFailureOptions(output.stdoutContent));

      const result = await runCommand(operands.command, [operands.arg]);

      expect(result).toEqual({ exitCode: PROCESS_FAILURE_EXIT_CODE });
    });
  });

  it("keeps captured child output off the invoking terminal streams", async () => {
    const observation = await observeChildStreamsOffTerminal();

    expect(observation.exitCode).toBe(SUCCESS_EXIT_CODE);
    expect(observation.terminalStdout).not.toContain(observation.stdoutContent);
    expect(observation.terminalStderr).not.toContain(observation.stderrContent);
    expect(observation.serializedResult).toContain(AGENT_TEST_OUTPUT_TEXT.STDOUT);
  });
});
