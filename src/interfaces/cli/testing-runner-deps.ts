import type { ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import type {
  TestingLanguageDescriptor,
  TestRunCommandResult,
  TestRunnerDependencies,
} from "@/testing/languages/types";

export const PROCESS_FAILURE_EXIT_CODE = 1;
export const AGENT_TEST_OUTPUT_ENV = {
  CI: "1",
} as const;
export const AGENT_TEST_OUTPUT_COMMAND = {
  PACKAGE_MANAGER: "pnpm",
  PACKAGE_MANAGER_EXEC_ARG: "exec",
  VITEST: "vitest",
  VITEST_RUN_ARG: "run",
  VITEST_ROOT_FLAG: "--root",
  LOCAL_BINARY_DIR: "node_modules/.bin",
  NODE_EVAL_ARG: "-e",
} as const;
export const AGENT_TEST_OUTPUT_STREAM_METHOD = "write";
export const AGENT_TEST_OUTPUT_TEXT_ENCODING = "utf8";
export const AGENT_ARTIFACT_DIR_PREFIX = "spx-test-agent-";
export const AGENT_TEST_OUTPUT_PROCESS_EVENT = {
  CLOSE: "close",
  DATA: "data",
  ERROR: "error",
} as const;

const STDOUT_FILE_SUFFIX = "stdout.log";
const STDERR_FILE_SUFFIX = "stderr.log";
const ARTIFACT_INDEX_WIDTH = 3;
const ARTIFACT_INDEX_RADIX = 10;
const ARTIFACT_FILE_FLAGS = "wx";
const EMPTY_RUNNER_ARGS: readonly string[] = [];
export const VITEST_FAILURE_LINE_MARKERS = [" FAIL ", " ❯ "] as const;

export interface AgentRunnerOptions {
  readonly tmpDir?: string;
  readonly processRunner?: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
}

interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
}

// Spawns a managed child through the lifecycle runner, forwards its stdout to the
// caller-chosen stream and its stderr to the CLI's error stream, and resolves with
// the child's terminal exit code. The stdout stream is a parameter because `spx test`
// wants the run's output on stdout while `spx spec status --update` must keep stdout
// for the status rollup and route per-node output to stderr.
function createCommandRunner(
  productDir: string,
  outStream: NodeJS.WritableStream,
): TestRunnerDependencies["runCommand"] {
  return (command, args) =>
    new Promise<TestRunCommandResult>((resolveResult) => {
      const resolved = resolveTestingCommand(productDir, command, args);
      const child: ChildProcess = spawnManagedSubprocess(lifecycleProcessRunner, resolved.command, resolved.args, {
        cwd: productDir,
      });
      child.stdout?.pipe(outStream);
      child.stderr?.pipe(process.stderr);
      child.on("close", (code) => resolveResult({ exitCode: code ?? PROCESS_FAILURE_EXIT_CODE }));
      child.on("error", () => resolveResult({ exitCode: PROCESS_FAILURE_EXIT_CODE }));
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
): (language: TestingLanguageDescriptor) => TestRunnerDependencies {
  const runCommand = createCommandRunner(productDir, outStream);
  return () => ({ runCommand });
}

function resolveTestingCommand(productDir: string, command: string, args: readonly string[]): ResolvedCommand {
  const [firstArg, secondArg, ...remainingArgs] = args;
  if (
    command === AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER
    && firstArg === AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER_EXEC_ARG
    && secondArg === AGENT_TEST_OUTPUT_COMMAND.VITEST
  ) {
    return {
      command: join(
        productDir,
        AGENT_TEST_OUTPUT_COMMAND.LOCAL_BINARY_DIR,
        AGENT_TEST_OUTPUT_COMMAND.VITEST,
      ),
      args: remainingArgs,
    };
  }
  return { command, args };
}

function isVitestInvocation(command: string, args: readonly string[]): boolean {
  const [firstArg, secondArg] = args;
  return command === AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER
    && firstArg === AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER_EXEC_ARG
    && secondArg === AGENT_TEST_OUTPUT_COMMAND.VITEST;
}

function vitestRequestedTestPaths(args: readonly string[]): readonly string[] {
  const [, , ...vitestArgs] = args;
  const testPaths: string[] = [];
  for (let index = 0; index < vitestArgs.length; index += 1) {
    const arg = vitestArgs[index];
    if (arg === AGENT_TEST_OUTPUT_COMMAND.VITEST_RUN_ARG) continue;
    if (arg === AGENT_TEST_OUTPUT_COMMAND.VITEST_ROOT_FLAG) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    testPaths.push(arg);
  }
  return testPaths;
}

export function extractVitestFailurePaths(
  output: string,
  requestedTestPaths: readonly string[],
): readonly string[] {
  const lines = output.split("\n");
  return requestedTestPaths.filter((testPath) =>
    lines.some((line) =>
      line.includes(testPath) && VITEST_FAILURE_LINE_MARKERS.some((marker) => line.includes(marker))
    )
  );
}

function artifactFileName(index: number, suffix: string): string {
  return `${index.toString(ARTIFACT_INDEX_RADIX).padStart(ARTIFACT_INDEX_WIDTH, "0")}-${suffix}`;
}

function createAgentOutputCommandRunner(
  productDir: string,
  options: AgentRunnerOptions = {},
): TestRunnerDependencies["runCommand"] {
  const artifactRoot = mkdtemp(join(options.tmpDir ?? tmpdir(), AGENT_ARTIFACT_DIR_PREFIX));
  const processRunner = options.processRunner ?? lifecycleProcessRunner;
  const inheritedEnv = options.env ?? process.env;
  let nextArtifactIndex = 0;

  return async (command, args = EMPTY_RUNNER_ARGS) => {
    nextArtifactIndex += 1;
    const root = await artifactRoot;
    const stdoutPath = join(root, artifactFileName(nextArtifactIndex, STDOUT_FILE_SUFFIX));
    const stderrPath = join(root, artifactFileName(nextArtifactIndex, STDERR_FILE_SUFFIX));
    const stdoutFile = createWriteStream(stdoutPath, { flags: ARTIFACT_FILE_FLAGS });
    const stderrFile = createWriteStream(stderrPath, { flags: ARTIFACT_FILE_FLAGS });
    const resolved = resolveTestingCommand(productDir, command, args);
    const shouldExtractVitestFailures = isVitestInvocation(command, args);

    return new Promise<TestRunCommandResult>((resolveResult) => {
      const child: ChildProcess = spawnManagedSubprocess(processRunner, resolved.command, resolved.args, {
        cwd: productDir,
        env: {
          ...inheritedEnv,
          ...AGENT_TEST_OUTPUT_ENV,
        },
      });
      child.stdout?.pipe(stdoutFile);
      child.stderr?.pipe(stderrFile);

      const finishFiles = async (): Promise<void> => {
        stdoutFile.end();
        stderrFile.end();
        await Promise.all([finished(stdoutFile), finished(stderrFile)]);
      };

      const resolveWithExitCode = (exitCode: number): void => {
        finishFiles()
          .then(async () => {
            const failingTestPaths = shouldExtractVitestFailures
              ? extractVitestFailurePaths(
                await readFile(stdoutPath, AGENT_TEST_OUTPUT_TEXT_ENCODING),
                vitestRequestedTestPaths(args),
              )
              : [];
            resolveResult({
              exitCode,
              output: {
                stdoutPath,
                stderrPath,
                ...(failingTestPaths.length === 0 ? {} : { failingTestPaths }),
              },
            });
          })
          .catch(() => {
            resolveResult({ exitCode, output: { stdoutPath, stderrPath } });
          });
      };

      child.on("close", (code) => resolveWithExitCode(code ?? PROCESS_FAILURE_EXIT_CODE));
      child.on("error", () => resolveWithExitCode(PROCESS_FAILURE_EXIT_CODE));
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

export { createAgentOutputCommandRunner, resolveTestingCommand };
