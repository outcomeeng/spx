import type { ChildProcess } from "node:child_process";

import { lifecycleProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { pythonTestingLanguage } from "@/testing/languages/python";
import type {
  TestingLanguageDescriptor,
  TestRunCommandResult,
  TestRunnerDependencies,
} from "@/testing/languages/types";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { detectPython, detectTypeScript } from "@/validation/discovery/language-finder";

export const PROCESS_FAILURE_EXIT_CODE = 1;
const NO_PRESENCE_DETECTOR_ERROR = "no presence detector configured for testing language";

// Each registered language's presence check, keyed by descriptor name. The
// descriptor delegates detection to an agnostic `isLanguagePresent`, so the
// composition root supplies the concrete per-language check here.
const PRESENCE_BY_LANGUAGE_NAME: Record<string, (productDir: string) => boolean> = {
  [typescriptTestingLanguage.name]: (productDir) => detectTypeScript(productDir).present,
  [pythonTestingLanguage.name]: (productDir) => detectPython(productDir).present,
};

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
 * Builds the per-language runner dependencies the `spx test` run and the
 * `spx spec status --update` outcome resolver both compose: presence detection
 * keyed by descriptor name plus a command runner scoped to the product directory.
 * Both CLI descriptors share this one composition so the presence map never drifts.
 * `outStream` receives each child's stdout — `spx test` keeps the default
 * `process.stdout`, while `spx spec status --update` passes `process.stderr` so the
 * status rollup (text or `--json`) is the only thing written to stdout.
 */
export function createRunnerDepsFor(
  productDir: string,
  outStream: NodeJS.WritableStream = process.stdout,
): (language: TestingLanguageDescriptor) => TestRunnerDependencies {
  const runCommand = createCommandRunner(productDir, outStream);
  return (language) => {
    const isLanguagePresent = PRESENCE_BY_LANGUAGE_NAME[language.name];
    if (isLanguagePresent === undefined) {
      throw new Error(`${NO_PRESENCE_DETECTOR_ERROR}: ${language.name}`);
    }
    return { isLanguagePresent, runCommand };
  };
}
