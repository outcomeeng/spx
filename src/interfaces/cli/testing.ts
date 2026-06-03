import type { Command } from "commander";

import { runTestsCommand, type TestDispatchResult } from "@/commands/testing";
import type { Domain } from "@/domains/types";
import { detectWorktreeProductRoot } from "@/git/root";
import { writeWarning } from "@/interfaces/cli/write-warning";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { testingRegistry } from "@/testing/registry";

import { createRunnerDepsFor, PROCESS_FAILURE_EXIT_CODE } from "./testing-runner-deps";

const TESTING_CLI = {
  commandName: "test",
  description: "Run spec-tree tests across product languages",
  passingSubcommand: "passing",
  passingDescription: "Run only the tests within the configured passing scope",
} as const;

const UNMATCHED_TEST_FILES_WARNING = "Skipped test files with no registered runner";

const TESTING_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `Warning: Not in a git repository. Reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} tests relative to the current working directory.`,
} as const;

async function resolveTestProductDir(): Promise<string> {
  const { productDir, isGitRepo } = await detectWorktreeProductRoot(process.cwd());
  writeWarning(isGitRepo ? undefined : TESTING_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  return productDir;
}

// Runs the testing command, surfacing its dispatch result; a config or recording
// failure exits here, where the descriptor owns the process boundary.
async function runTestsThroughCommand(productDir: string, passing: boolean): Promise<TestDispatchResult> {
  try {
    const result = await runTestsCommand(
      { productDir, passing },
      { registry: testingRegistry, runnerDepsFor: createRunnerDepsFor(productDir) },
    );
    return result.dispatch;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(PROCESS_FAILURE_EXIT_CODE);
  }
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
      reportAndExit(await runTestsThroughCommand(productDir, false));
    });

    testCmd
      .command(TESTING_CLI.passingSubcommand)
      .description(TESTING_CLI.passingDescription)
      .action(async () => {
        const productDir = await resolveTestProductDir();
        reportAndExit(await runTestsThroughCommand(productDir, true));
      });
  },
};
