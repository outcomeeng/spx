import type { Command } from "commander";

import { runTestsCommand, type RecordedTestRun, type TestDispatchResult } from "@/commands/testing";
import { SUCCESS_EXIT_CODE } from "@/domains/testing";
import type { Domain } from "@/domains/types";
import { detectWorktreeProductRoot } from "@/git/root";
import { formatAgentTestOutput } from "@/interfaces/cli/testing-agent-output";
import { writeWarning as writeCliWarning } from "@/interfaces/cli/write-warning";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { testingRegistry } from "@/testing/registry";

import { createAgentRunnerDepsFor, createRunnerDepsFor, PROCESS_FAILURE_EXIT_CODE } from "./testing-runner-deps";

export const TESTING_CLI = {
  commandName: "test",
  description: "Run spec-tree tests across product languages",
  agentOption: "--agent",
  agentDescription: "Capture raw runner output and print a compact agent summary",
  passingSubcommand: "passing",
  passingDescription: "Run only the tests within the configured passing scope",
} as const;

const UNMATCHED_TEST_FILES_WARNING = "Skipped test files with no registered runner";
const GATED_TEST_RUNNERS_WARNING = "Skipped test files because their registered runner was gated out";

const TESTING_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `Warning: Not in a git repository. Reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} tests relative to the current working directory.`,
} as const;

async function resolveTestProductDir(): Promise<string> {
  const { productDir, isGitRepo } = await detectWorktreeProductRoot(process.cwd());
  writeCliWarning(isGitRepo ? undefined : TESTING_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  return productDir;
}

// Runs the testing command, surfacing its dispatch result; a config or recording
// failure exits here, where the descriptor owns the process boundary.
async function runTestsThroughCommand(productDir: string, passing: boolean): Promise<RecordedTestRun> {
  try {
    return await runTestsCommand(
      { productDir, passing },
      { registry: testingRegistry, runnerDepsFor: createRunnerDepsFor(productDir) },
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(PROCESS_FAILURE_EXIT_CODE);
  }
}

async function runAgentTestsThroughCommand(productDir: string, passing: boolean): Promise<RecordedTestRun> {
  try {
    return await runTestsCommand(
      { productDir, passing },
      { registry: testingRegistry, runnerDepsFor: createAgentRunnerDepsFor(productDir) },
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(PROCESS_FAILURE_EXIT_CODE);
  }
}

function unreportedGroups(result: TestDispatchResult): typeof result.groups {
  const reportedRunnerIds = new Set(result.reports.map((report) => report.runnerId));
  return result.groups.filter((group) => !reportedRunnerIds.has(group.language.name));
}

interface TestingCliExitDependencies {
  readonly exit: TestingCliDependencies["exit"];
  readonly writeWarning: TestingCliDependencies["writeWarning"];
}

function reportAndExit(result: TestDispatchResult, deps: TestingCliExitDependencies): never {
  if (result.unmatched.length > 0) {
    deps.writeWarning(`${UNMATCHED_TEST_FILES_WARNING}:\n${result.unmatched.join("\n")}`);
  }
  const gatedGroups = unreportedGroups(result);
  if (result.exitCode !== SUCCESS_EXIT_CODE && gatedGroups.length > 0) {
    deps.writeWarning(
      [
        GATED_TEST_RUNNERS_WARNING,
        ...gatedGroups.flatMap((group) => [
          group.language.name,
          ...group.testPaths,
        ]),
      ].join("\n"),
    );
  }
  deps.exit(result.exitCode);
}

interface TestingCliActionOptions {
  readonly agent?: boolean;
}

function requestsAgentMode(options: TestingCliActionOptions, command: Command): boolean {
  const parentOptions = command.parent?.opts<TestingCliActionOptions>() ?? {};
  return options.agent === true || parentOptions.agent === true;
}

export interface TestingCliDependencies {
  readonly resolveProductDir: () => Promise<string>;
  readonly runTests: (productDir: string, passing: boolean) => Promise<RecordedTestRun>;
  readonly runAgentTests: (productDir: string, passing: boolean) => Promise<RecordedTestRun>;
  readonly writeStdout: (output: string) => void;
  readonly writeWarning: (warning: string | undefined) => void;
  readonly setExitCode: (exitCode: number) => void;
  readonly exit: (exitCode: number) => never;
}

const defaultTestingCliDependencies: TestingCliDependencies = {
  resolveProductDir: resolveTestProductDir,
  runTests: runTestsThroughCommand,
  runAgentTests: runAgentTestsThroughCommand,
  writeStdout: (output) => {
    process.stdout.write(output);
  },
  writeWarning: writeCliWarning,
  setExitCode: (exitCode) => {
    process.exitCode = exitCode;
  },
  exit: (exitCode) => process.exit(exitCode),
};

async function runTestingAction(
  deps: TestingCliDependencies,
  passing: boolean,
  options: TestingCliActionOptions,
): Promise<void> {
  const productDir = await deps.resolveProductDir();
  if (options.agent === true) {
    const result = await deps.runAgentTests(productDir, passing);
    deps.writeStdout(formatAgentTestOutput(result));
    deps.setExitCode(result.dispatch.exitCode);
    return;
  }
  const result = await deps.runTests(productDir, passing);
  reportAndExit(result.dispatch, deps);
}

export function createTestingDomain(deps: TestingCliDependencies = defaultTestingCliDependencies): Domain {
  return {
    name: TESTING_CLI.commandName,
    description: TESTING_CLI.description,
    register: (program: Command) => {
      const testCmd = program.command(TESTING_CLI.commandName).description(TESTING_CLI.description);
      testCmd.option(TESTING_CLI.agentOption, TESTING_CLI.agentDescription);

      testCmd.action(async (options: TestingCliActionOptions, command: Command) => {
        await runTestingAction(deps, false, { agent: requestsAgentMode(options, command) });
      });

      testCmd
        .command(TESTING_CLI.passingSubcommand)
        .description(TESTING_CLI.passingDescription)
        .option(TESTING_CLI.agentOption, TESTING_CLI.agentDescription)
        .action(async (options: TestingCliActionOptions, command: Command) => {
          await runTestingAction(deps, true, { agent: requestsAgentMode(options, command) });
        });
    },
  };
}

export const testingDomain: Domain = createTestingDomain();
