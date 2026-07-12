import type { ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import type {
  RelatedTestCommandResult,
  RelatedTestDependencies,
  TestingLanguageDescriptor,
  TestRunCommandResult,
  TestRunnerDependencies,
} from "@/test/languages/types";

export const PROCESS_FAILURE_EXIT_CODE = 1;
export const AGENT_ARTIFACT_DIR_PREFIX = "spx-test-agent-";

const STDOUT_FILE_SUFFIX = "stdout.log";
const STDERR_FILE_SUFFIX = "stderr.log";
const ARTIFACT_INDEX_WIDTH = 3;
const ARTIFACT_INDEX_RADIX = 10;
const ARTIFACT_FILE_FLAGS = "wx";
const EMPTY_RUNNER_ARGS: readonly string[] = [];

interface ArtifactWriters {
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutFile: Writable;
  readonly stderrFile: Writable;
  readonly completion: Promise<readonly [void, void]>;
}

interface CapturedCommandRequest {
  readonly productDir: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly processRunner: ProcessRunner;
  readonly inheritedEnv: NodeJS.ProcessEnv;
  readonly writers: ArtifactWriters;
}

export interface AgentRunnerOptions {
  readonly tmpDir?: string;
  readonly processRunner?: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly createArtifactWriteStream?: (path: string) => Writable;
}

// Spawns a managed child through the lifecycle runner, forwards its stdout to the
// caller-chosen stream and its stderr to the CLI's error stream, and resolves with
// the child's terminal exit code. The stdout stream is a parameter because `spx test`
// wants the run's output on stdout while `spx spec status --update` must keep stdout
// for the status rollup and route per-node output to stderr.
function createCommandRunner(
  productDir: string,
  outStream: NodeJS.WritableStream,
  errStream: NodeJS.WritableStream,
  processRunner: ProcessRunner,
): TestRunnerDependencies["runCommand"] {
  return (command, args) =>
    new Promise<TestRunCommandResult>((resolveResult) => {
      const child: ChildProcess = spawnManagedSubprocess(processRunner, command, args, {
        cwd: productDir,
      });
      child.stdout?.pipe(outStream);
      child.stderr?.pipe(errStream);
      child.on("close", (code) => resolveResult({ exitCode: code ?? PROCESS_FAILURE_EXIT_CODE }));
      child.on("error", () => resolveResult({ exitCode: PROCESS_FAILURE_EXIT_CODE }));
    });
}

function createRelatedCommandRunner(
  productDir: string,
  processRunner: ProcessRunner,
): RelatedTestDependencies["runCommand"] {
  return (command, args) =>
    new Promise<RelatedTestCommandResult>((resolveResult) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const child: ChildProcess = spawnManagedSubprocess(processRunner, command, args, {
        cwd: productDir,
      });
      child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(String(chunk)));
      child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(String(chunk)));
      child.on("close", (code) =>
        resolveResult({
          exitCode: code ?? PROCESS_FAILURE_EXIT_CODE,
          stdout: stdout.join(""),
          stderr: stderr.join(""),
        }));
      child.on("error", (error) =>
        resolveResult({
          exitCode: PROCESS_FAILURE_EXIT_CODE,
          stdout: stdout.join(""),
          stderr: error.message,
        }));
    });
}

/**
 * Builds the runner dependencies the `spx test` run and the
 * `spx spec status --update` outcome resolver both compose: a command runner
 * scoped to the product directory. Language presence belongs to each descriptor.
 * `outStream` receives each child's stdout — `spx test` keeps the default
 * `process.stdout`, while `spx spec status --update` passes `process.stderr` so the
 * status rollup (text or `--json`) is the only thing written to stdout.
 */
export function createRunnerDepsFor(
  productDir: string,
  outStream: NodeJS.WritableStream = process.stdout,
  processRunner: ProcessRunner = lifecycleProcessRunner,
  errStream: NodeJS.WritableStream = process.stderr,
): (language: TestingLanguageDescriptor) => TestRunnerDependencies {
  const runCommand = createCommandRunner(productDir, outStream, errStream, processRunner);
  return () => ({ runCommand });
}

export function createRelatedDepsFor(
  productDir: string,
  processRunner: ProcessRunner = lifecycleProcessRunner,
): (language: TestingLanguageDescriptor) => RelatedTestDependencies {
  const runCommand = createRelatedCommandRunner(productDir, processRunner);
  return () => ({ runCommand, readFile: (path) => readFile(join(productDir, path), "utf8") });
}

function artifactFileName(index: number, suffix: string): string {
  return `${index.toString(ARTIFACT_INDEX_RADIX).padStart(ARTIFACT_INDEX_WIDTH, "0")}-${suffix}`;
}

function createArtifactWriters(
  root: string,
  index: number,
  createArtifactWriteStream: (path: string) => Writable,
): ArtifactWriters {
  const stdoutPath = join(root, artifactFileName(index, STDOUT_FILE_SUFFIX));
  const stderrPath = join(root, artifactFileName(index, STDERR_FILE_SUFFIX));
  const stdoutFile = createArtifactWriteStream(stdoutPath);
  const stderrFile = createArtifactWriteStream(stderrPath);
  return {
    stdoutPath,
    stderrPath,
    stdoutFile,
    stderrFile,
    completion: Promise.all([finished(stdoutFile), finished(stderrFile)]),
  };
}

async function finishArtifactWriters(writers: ArtifactWriters): Promise<TestRunCommandResult["output"]> {
  writers.stdoutFile.end();
  writers.stderrFile.end();
  await writers.completion;
  return {
    stdoutPath: writers.stdoutPath,
    stderrPath: writers.stderrPath,
  };
}

function runCapturedCommand(request: CapturedCommandRequest): Promise<TestRunCommandResult> {
  return new Promise<TestRunCommandResult>((resolveResult) => {
    let settled = false;
    const resolveOnce = (result: TestRunCommandResult): void => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };
    const child: ChildProcess = spawnManagedSubprocess(request.processRunner, request.command, request.args, {
      cwd: request.productDir,
      env: request.inheritedEnv,
    });
    child.stdout?.pipe(request.writers.stdoutFile);
    child.stderr?.pipe(request.writers.stderrFile);
    const resolveWithExitCode = (exitCode: number): void => {
      finishArtifactWriters(request.writers)
        .then((output) => resolveOnce({ exitCode, output }))
        .catch(() => resolveOnce({ exitCode: PROCESS_FAILURE_EXIT_CODE }));
    };
    request.writers.completion.catch(() => {
      child.kill();
      resolveOnce({ exitCode: PROCESS_FAILURE_EXIT_CODE });
    });
    child.on("close", (code) => resolveWithExitCode(code ?? PROCESS_FAILURE_EXIT_CODE));
    child.on("error", () => resolveWithExitCode(PROCESS_FAILURE_EXIT_CODE));
  });
}

function createAgentOutputCommandRunner(
  productDir: string,
  options: AgentRunnerOptions = {},
): TestRunnerDependencies["runCommand"] {
  let artifactRoot: Promise<string> | undefined;
  const processRunner = options.processRunner ?? lifecycleProcessRunner;
  const inheritedEnv = options.env ?? process.env;
  const createArtifactWriteStream = options.createArtifactWriteStream
    ?? ((path: string): Writable => createWriteStream(path, { flags: ARTIFACT_FILE_FLAGS }));
  let nextArtifactIndex = 0;

  return async (command, args = EMPTY_RUNNER_ARGS) => {
    nextArtifactIndex += 1;
    artifactRoot ??= mkdtemp(join(options.tmpDir ?? tmpdir(), AGENT_ARTIFACT_DIR_PREFIX));
    const root = await artifactRoot;
    return runCapturedCommand({
      productDir,
      command,
      args,
      processRunner,
      inheritedEnv,
      writers: createArtifactWriters(root, nextArtifactIndex, createArtifactWriteStream),
    });
  };
}

export function createAgentRunnerDepsFor(
  productDir: string,
  options: AgentRunnerOptions = {},
): (language: TestingLanguageDescriptor) => TestRunnerDependencies {
  const runCommand = createAgentOutputCommandRunner(productDir, options);
  return () => ({ runCommand });
}

export { createAgentOutputCommandRunner };
