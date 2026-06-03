import type { ChildProcess } from "node:child_process";

import type { Command } from "commander";

import { runTests, type TestDispatchResult } from "@/commands/testing";
import { resolveConfig } from "@/config/index";
import type { PathFilterConfig } from "@/config/primitives";
import type { Result } from "@/config/types";
import type { Domain } from "@/domains/types";
import { detectWorktreeProductRoot } from "@/git/root";
import { writeWarning } from "@/interfaces/cli/write-warning";
import { lifecycleProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { type TestingConfig, testingConfigDescriptor } from "@/testing/config";
import { pythonTestingLanguage } from "@/testing/languages/python";
import type {
  TestingLanguageDescriptor,
  TestRunCommandResult,
  TestRunnerDependencies,
} from "@/testing/languages/types";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { testingRegistry } from "@/testing/registry";
import { detectPython, detectTypeScript } from "@/validation/discovery/language-finder";

const TESTING_CLI = {
  commandName: "test",
  description: "Run spec-tree tests across product languages",
  passingSubcommand: "passing",
  passingDescription: "Run only the tests within the configured passing scope",
} as const;

const PROCESS_FAILURE_EXIT_CODE = 1;
const UNMATCHED_TEST_FILES_WARNING = "Skipped test files with no registered runner";
const NO_PRESENCE_DETECTOR_ERROR = "no presence detector configured for testing language";
const TESTING_CONFIG_ERROR = "failed to resolve testing config";

const TESTING_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `Warning: Not in a git repository. Reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} tests relative to the current working directory.`,
} as const;

// Each registered language's presence check, keyed by descriptor name. The
// descriptor delegates detection to an agnostic `isLanguagePresent`, so the
// composition root supplies the concrete per-language check here.
const PRESENCE_BY_LANGUAGE_NAME: Record<string, (productDir: string) => boolean> = {
  [typescriptTestingLanguage.name]: (productDir) => detectTypeScript(productDir).present,
  [pythonTestingLanguage.name]: (productDir) => detectPython(productDir).present,
};

// Spawns a managed child through the lifecycle runner, forwards its output to the
// CLI's own streams, and resolves with the child's terminal exit code.
function createCommandRunner(productDir: string): TestRunnerDependencies["runCommand"] {
  return (command, args) =>
    new Promise<TestRunCommandResult>((resolveResult) => {
      const child: ChildProcess = spawnManagedSubprocess(lifecycleProcessRunner, command, args, {
        cwd: productDir,
      });
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);
      child.on("close", (code) => resolveResult({ exitCode: code ?? PROCESS_FAILURE_EXIT_CODE }));
      child.on("error", () => resolveResult({ exitCode: PROCESS_FAILURE_EXIT_CODE }));
    });
}

function createRunnerDepsFor(
  productDir: string,
): (language: TestingLanguageDescriptor) => TestRunnerDependencies {
  const runCommand = createCommandRunner(productDir);
  return (language) => {
    const isLanguagePresent = PRESENCE_BY_LANGUAGE_NAME[language.name];
    if (isLanguagePresent === undefined) {
      throw new Error(`${NO_PRESENCE_DETECTOR_ERROR}: ${language.name}`);
    }
    return { isLanguagePresent, runCommand };
  };
}

async function resolveTestProductDir(): Promise<string> {
  const { productDir, isGitRepo } = await detectWorktreeProductRoot(process.cwd());
  writeWarning(isGitRepo ? undefined : TESTING_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  return productDir;
}

async function resolveTestingPassingScope(productDir: string): Promise<Result<PathFilterConfig>> {
  const loaded = await resolveConfig(productDir, [testingConfigDescriptor]);
  if (!loaded.ok) {
    return loaded;
  }
  return { ok: true, value: (loaded.value[testingConfigDescriptor.section] as TestingConfig).passingScope };
}

function reportAndExit(result: TestDispatchResult): never {
  if (result.unmatched.length > 0) {
    writeWarning(`${UNMATCHED_TEST_FILES_WARNING}:\n${result.unmatched.join("\n")}`);
  }
  process.exit(result.exitCode);
}

export const testingDomain: Domain = {
  name: TESTING_CLI.commandName,
  description: TESTING_CLI.description,
  register: (program: Command) => {
    const testCmd = program.command(TESTING_CLI.commandName).description(TESTING_CLI.description);

    testCmd.action(async () => {
      const productDir = await resolveTestProductDir();
      reportAndExit(
        await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: createRunnerDepsFor(productDir) }),
      );
    });

    testCmd
      .command(TESTING_CLI.passingSubcommand)
      .description(TESTING_CLI.passingDescription)
      .action(async () => {
        const productDir = await resolveTestProductDir();
        const passingScope = await resolveTestingPassingScope(productDir);
        if (!passingScope.ok) {
          process.stderr.write(`${TESTING_CONFIG_ERROR}: ${passingScope.error}\n`);
          process.exit(PROCESS_FAILURE_EXIT_CODE);
        }
        reportAndExit(
          await runTests(
            { productDir, registry: testingRegistry, passingScope: passingScope.value },
            { runnerDepsFor: createRunnerDepsFor(productDir) },
          ),
        );
      });
  },
};
