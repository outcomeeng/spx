import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  createAgentOutputCommandRunner,
  PROCESS_FAILURE_EXIT_CODE,
} from "@/interfaces/cli/test-runner-deps";
import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface RecordedProcessSpawn {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

const nodeEvalArg = "-e";

function recordingProcessRunner(calls: RecordedProcessSpawn[]): ProcessRunner {
  return {
    spawn(command, args, options) {
      calls.push({ command, args, env: options?.env });
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [
        nodeEvalArg,
        "",
      ], { cwd: options?.cwd, env: options?.env });
    },
  };
}

function persistentProcessRunner(): ProcessRunner {
  return {
    spawn(command, args, options) {
      const script = [
        outputScript(command, args.join(""), command),
        "setInterval(() => {}, Number.MAX_SAFE_INTEGER);",
      ].join("");
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [
        nodeEvalArg,
        script,
      ], { cwd: options?.cwd, env: options?.env });
    },
  };
}

function runNodeProcess(args: readonly string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, args, { cwd });
    let stdout = "";
    let stderr = "";
    if (child.stdout === null || child.stderr === null) {
      reject(new Error("managed subprocess stdio streams are required"));
      return;
    }
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    childStdout.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string) => {
      stdout += String(chunk);
    });
    childStderr.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string) => {
      stderr += String(chunk);
    });
    child.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, reject);
    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function outputScript(stdoutContent: string, stderrContent: string, envKey: string): string {
  const cwdRead = ["process", "cwd()"].join(".");
  const envRead = `process.env[${JSON.stringify(envKey)}]`;
  return [
    `process.${AGENT_TEST_OUTPUT_TEXT.STDOUT}.write(${JSON.stringify(stdoutContent)});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDERR}.write(${JSON.stringify(stderrContent)});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDOUT}.write(${cwdRead});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDERR}.write(${envRead} ?? "");`,
  ].join("");
}

function failingArtifactWriteStream(message: string): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error(message));
    },
    final(callback) {
      callback();
    },
  });
}

describe("agent test-output runner", () => {
  it("does not expose child-process helper constants on the production dependency surface", async () => {
    const runnerDeps = await import("@/interfaces/cli/test-runner-deps");

    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_COMMAND");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_PROCESS_EVENT");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_STREAM_METHOD");
    expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_TEXT_ENCODING");
  });

  it("defers artifact directory creation until a runner command executes", async () => {
    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      createAgentOutputCommandRunner(productDir, { tmpDir: productDir });

      expect(await readdir(productDir)).toEqual([]);
    });
  });

  it("captures stdout and stderr to artifact files while preserving env and cwd", async () => {
    const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());
    const envValue = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runCommand = createAgentOutputCommandRunner(productDir, {
        tmpDir: productDir,
        env: { [envKey]: envValue },
      });
      const result = await runCommand(process.execPath, [
        nodeEvalArg,
        outputScript(stdoutContent, stderrContent, envKey),
      ]);

      expect(result.output).toBeDefined();
      if (result.output === undefined) throw new Error("Expected captured runner output");
      expect(String(await readFile(result.output.stdoutPath))).toBe(
        `${stdoutContent}${await realpath(productDir)}`,
      );
      expect(String(await readFile(result.output.stderrPath))).toBe(
        `${stderrContent}${envValue}`,
      );
    });
  });

  it("preserves the selected runner command and arguments in agent mode", async () => {
    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runnerCommand = sampleLiteralTestValue(arbitraryDomainLiteral());
      const runnerArg = sampleLiteralTestValue(arbitraryDomainLiteral());
      const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());
      const envValue = sampleLiteralTestValue(arbitraryDomainLiteral());
      const calls: RecordedProcessSpawn[] = [];
      const runCommand = createAgentOutputCommandRunner(productDir, {
        tmpDir: productDir,
        processRunner: recordingProcessRunner(calls),
        env: { [envKey]: envValue },
      });

      const result = await runCommand(runnerCommand, [
        nodeEvalArg,
        runnerArg,
      ]);

      expect(result.exitCode).toBe(0);
      expect(calls).toEqual([{
        command: runnerCommand,
        args: [
          nodeEvalArg,
          runnerArg,
        ],
        env: { [envKey]: envValue },
      }]);
    });
  });

  it("fails without artifact paths when artifact writing fails", async () => {
    const failureMessage = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runCommand = createAgentOutputCommandRunner(productDir, {
        tmpDir: productDir,
        env: {},
        processRunner: persistentProcessRunner(),
        createArtifactWriteStream: () => failingArtifactWriteStream(failureMessage),
      });

      const result = await runCommand(
        sampleLiteralTestValue(arbitraryDomainLiteral()),
        [sampleLiteralTestValue(arbitraryDomainLiteral())],
      );

      expect(result).toEqual({ exitCode: PROCESS_FAILURE_EXIT_CODE });
    });
  });

  it("keeps captured child output off the invoking terminal streams", async () => {
    const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const resultPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
      const repoDir = process.cwd();
      const moduleUrl = pathToFileURL(join(repoDir, "src/interfaces/cli/test-runner-deps.ts")).href;
      const script = [
        `const productDir = ${JSON.stringify(productDir)};`,
        `const resultPath = ${JSON.stringify(resultPath)};`,
        `const { createAgentOutputCommandRunner } = await import(${JSON.stringify(moduleUrl)});`,
        `const { writeFile } = await import(${JSON.stringify("node:fs/promises")});`,
        `const runCommand = createAgentOutputCommandRunner(productDir, { tmpDir: productDir, env: {} });`,
        `const result = await runCommand(process.execPath, [${JSON.stringify(nodeEvalArg)}, ${
          JSON.stringify(outputScript(stdoutContent, stderrContent, envKey))
        }]);`,
        "await writeFile(resultPath, Buffer.from(JSON.stringify(result)));",
      ].join("");

      const result = await runNodeProcess([
        "--import",
        "tsx",
        nodeEvalArg,
        script,
      ], repoDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(stdoutContent);
      expect(result.stderr).not.toContain(stderrContent);
      expect(String(await readFile(resultPath))).toContain(AGENT_TEST_OUTPUT_TEXT.STDOUT);
    });
  });
});
