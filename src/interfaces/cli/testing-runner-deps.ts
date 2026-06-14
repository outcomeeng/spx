import type { ChildProcess } from "node:child_process";

import { lifecycleProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import type {
  TestingLanguageDescriptor,
  TestRunCommandResult,
  TestRunnerDependencies,
} from "@/testing/languages/types";

export const PROCESS_FAILURE_EXIT_CODE = 1;

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
      const child: ChildProcess = spawnManagedSubprocess(lifecycleProcessRunner, command, args, {
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
