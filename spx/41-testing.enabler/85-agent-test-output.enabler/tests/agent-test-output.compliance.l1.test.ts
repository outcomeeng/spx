import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/testing-agent-output";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  AGENT_TEST_OUTPUT_COMMAND,
  AGENT_TEST_OUTPUT_ENV,
  AGENT_TEST_OUTPUT_PROCESS_EVENT,
  AGENT_TEST_OUTPUT_STREAM_METHOD,
  AGENT_TEST_OUTPUT_TEXT_ENCODING,
  createAgentOutputCommandRunner,
} from "@/interfaces/cli/testing-runner-deps";
import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import {
  arbitraryDomainLiteral,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface RecordedProcessSpawn {
  readonly command: string;
  readonly args: readonly string[];
}

function recordingProcessRunner(calls: RecordedProcessSpawn[]): ProcessRunner {
  return {
    spawn(command, args, options) {
      calls.push({ command, args });
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [
        AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
        "",
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
    childStdout.setEncoding(AGENT_TEST_OUTPUT_TEXT_ENCODING);
    childStderr.setEncoding(AGENT_TEST_OUTPUT_TEXT_ENCODING);
    childStdout.on(AGENT_TEST_OUTPUT_PROCESS_EVENT.DATA, (chunk: string) => {
      stdout += chunk;
    });
    childStderr.on(AGENT_TEST_OUTPUT_PROCESS_EVENT.DATA, (chunk: string) => {
      stderr += chunk;
    });
    child.on(AGENT_TEST_OUTPUT_PROCESS_EVENT.ERROR, reject);
    child.on(AGENT_TEST_OUTPUT_PROCESS_EVENT.CLOSE, (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function outputScript(stdoutContent: string, stderrContent: string): string {
  const stdoutWrite = ["process", AGENT_TEST_OUTPUT_TEXT.STDOUT, AGENT_TEST_OUTPUT_STREAM_METHOD].join(".");
  const stderrWrite = ["process", AGENT_TEST_OUTPUT_TEXT.STDERR, AGENT_TEST_OUTPUT_STREAM_METHOD].join(".");
  const cwdRead = ["process", "cwd()"].join(".");
  const envRead = ["process", "env", "CI"].join(".");
  return [
    `${stdoutWrite}(${JSON.stringify(stdoutContent)});`,
    `${stderrWrite}(${JSON.stringify(stderrContent)});`,
    `${stdoutWrite}(${cwdRead});`,
    `${stderrWrite}(${envRead} ?? "");`,
  ].join("");
}

describe("agent test-output runner", () => {
  it("captures stdout and stderr to artifact files while setting CI and cwd", async () => {
    const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runCommand = createAgentOutputCommandRunner(productDir, { tmpDir: productDir, env: {} });
      const result = await runCommand(process.execPath, [
        AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
        outputScript(stdoutContent, stderrContent),
      ]);

      expect(result.output).toBeDefined();
      if (result.output === undefined) throw new Error();
      expect(await readFile(result.output.stdoutPath, AGENT_TEST_OUTPUT_TEXT_ENCODING)).toBe(
        `${stdoutContent}${await realpath(productDir)}`,
      );
      expect(await readFile(result.output.stderrPath, AGENT_TEST_OUTPUT_TEXT_ENCODING)).toBe(
        `${stderrContent}${AGENT_TEST_OUTPUT_ENV.CI}`,
      );
    });
  });

  it("preserves the selected runner command and arguments in agent mode", async () => {
    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runnerCommand = sampleLiteralTestValue(arbitraryDomainLiteral());
      const runnerArg = sampleLiteralTestValue(arbitraryDomainLiteral());
      const calls: RecordedProcessSpawn[] = [];
      const runCommand = createAgentOutputCommandRunner(productDir, {
        tmpDir: productDir,
        processRunner: recordingProcessRunner(calls),
        env: {},
      });

      const result = await runCommand(runnerCommand, [
        AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
        runnerArg,
      ]);

      expect(result.exitCode).toBe(0);
      expect(calls).toEqual([{
        command: runnerCommand,
        args: [
          AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
          runnerArg,
        ],
      }]);
    });
  });

  it("keeps captured child output off the invoking terminal streams", async () => {
    const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const resultPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
      const repoDir = process.cwd();
      const moduleUrl = pathToFileURL(join(repoDir, "src/interfaces/cli/testing-runner-deps.ts")).href;
      const script = [
        `const productDir = ${JSON.stringify(productDir)};`,
        `const resultPath = ${JSON.stringify(resultPath)};`,
        `const { createAgentOutputCommandRunner, AGENT_TEST_OUTPUT_COMMAND } = await import(${JSON.stringify(moduleUrl)});`,
        `const { writeFile } = await import(${JSON.stringify("node:fs/promises")});`,
        `const runCommand = createAgentOutputCommandRunner(productDir, { tmpDir: productDir, env: {} });`,
        `const result = await runCommand(process.execPath, [AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG, ${JSON.stringify(outputScript(stdoutContent, stderrContent))}]);`,
        `await writeFile(resultPath, JSON.stringify(result), ${JSON.stringify(AGENT_TEST_OUTPUT_TEXT_ENCODING)});`,
      ].join("");

      const result = await runNodeProcess([
        "--import",
        "tsx",
        AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
        script,
      ], repoDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(stdoutContent);
      expect(result.stderr).not.toContain(stderrContent);
      expect(await readFile(resultPath, AGENT_TEST_OUTPUT_TEXT_ENCODING)).toContain(AGENT_TEST_OUTPUT_TEXT.STDOUT);
    });
  });
});
