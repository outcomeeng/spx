import type { Command } from "commander";

import { type RecordedTestRun, runTestsCommand, type TestDispatchResult } from "@/commands/test";
import type { TargetSelection } from "@/domains/test";
import type { Domain } from "@/domains/types";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";
import { formatAgentTestOutput } from "@/interfaces/cli/test-agent-output";
import { detectWorktreeProductRoot } from "@/lib/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";

import {
  createAgentRunnerDepsFor,
  createRelatedDepsFor,
  createRunnerDepsFor,
  PROCESS_FAILURE_EXIT_CODE,
} from "./test-runner-deps";

export const TESTING_CLI = {
  commandName: "test",
  description: "Run spec-tree tests across product languages",
  agentOption: "--agent",
  agentDescription: "Capture raw runner output and print a compact agent summary",
  recursiveShortFlag: "-r",
  recursiveLongFlag: "--recursive",
  recursiveDescription: "Extend a node-path operand to its descendant nodes' tests",
  changedLongFlag: "--changed",
  changedDescription: "Run only tests affected by changes against the selected base",
  stagedLongFlag: "--staged",
  stagedDescription: "With --changed, diff the staged snapshot instead of the worktree",
  baseLongFlag: "--base",
  baseOperand: "<ref>",
  baseDescription: "Base ref for --changed; defaults to origin of the default branch",
  targetsArgument: "[targets...]",
  targetsDescription: "Node paths or test-file paths to run; omit to run the full discovered suite",
  passingSubcommand: "passing",
  passingDescription: "Run only the tests within the configured passing scope",
} as const;

const UNMATCHED_TEST_FILES_WARNING = "Skipped test files with no registered runner";
const GATED_TEST_RUNNERS_WARNING = "Skipped test files because their registered runner was gated out";
const UNRESOLVED_TARGETS_WARNING = "No tests matched these operands";
const UNRESOLVED_CHANGED_SOURCE_WARNING = "No related-test capability resolved these changed source files";

const TESTING_PRODUCT_DIR_WARNING = {
  NOT_GIT_REPOSITORY:
    `Warning: Not in a git repository. Reading ${SPEC_TREE_CONFIG.ROOT_DIRECTORY} tests relative to the current working directory.`,
} as const;

async function resolveTestProductDir(
  cwd: string,
  writeWarning: (warning: string | undefined) => void,
): Promise<string> {
  const { productDir, isGitRepo } = await detectWorktreeProductRoot(cwd);
  writeWarning(isGitRepo ? undefined : TESTING_PRODUCT_DIR_WARNING.NOT_GIT_REPOSITORY);
  return productDir;
}

// Runs the testing command, surfacing its dispatch result; a config or recording
// failure exits here, where the descriptor owns the process boundary.
async function runTestsThroughCommand(
  productDir: string,
  passing: boolean,
  io: CliIo,
  targets?: TargetSelection,
  changed?: TestingChangedSelection,
): Promise<RecordedTestRun> {
  try {
    return await runTestsCommand(
      { productDir, passing, targets, changed },
      {
        registry: testingRegistry,
        runnerDepsFor: createRunnerDepsFor(productDir),
        relatedDepsFor: createRelatedDepsFor(productDir),
      },
    );
  } catch (error) {
    io.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(PROCESS_FAILURE_EXIT_CODE);
  }
}

async function runAgentTestsThroughCommand(
  productDir: string,
  passing: boolean,
  io: CliIo,
  targets?: TargetSelection,
  changed?: TestingChangedSelection,
): Promise<RecordedTestRun> {
  try {
    return await runTestsCommand(
      { productDir, passing, targets, changed },
      {
        registry: testingRegistry,
        runnerDepsFor: createAgentRunnerDepsFor(productDir),
        relatedDepsFor: createRelatedDepsFor(productDir),
      },
    );
  } catch (error) {
    io.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(PROCESS_FAILURE_EXIT_CODE);
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
  if (result.unresolvedTargets.length > 0) {
    deps.writeWarning(`${UNRESOLVED_TARGETS_WARNING}:\n${result.unresolvedTargets.join("\n")}`);
  }
  if ((result.unresolvedChangedSourceFiles ?? []).length > 0) {
    deps.writeWarning(
      `${UNRESOLVED_CHANGED_SOURCE_WARNING}:\n${(result.unresolvedChangedSourceFiles ?? []).join("\n")}`,
    );
  }
  if (result.unmatched.length > 0) {
    deps.writeWarning(`${UNMATCHED_TEST_FILES_WARNING}:\n${result.unmatched.join("\n")}`);
  }
  const gatedGroups = unreportedGroups(result);
  if (gatedGroups.length > 0) {
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
  readonly recursive?: boolean;
  readonly changed?: boolean;
  readonly staged?: boolean;
  readonly base?: string;
}

interface TestingChangedSelection {
  readonly baseRef?: string;
  readonly staged?: boolean;
}

function requestsAgentMode(options: TestingCliActionOptions, command: Command): boolean {
  const parentOptions = command.parent?.opts<TestingCliActionOptions>() ?? {};
  return options.agent === true || parentOptions.agent === true;
}

// Builds the operand selection from variadic targets, or undefined when none were
// supplied so the run keeps its full-suite discovery. The recursive flag is read
// from this command and its parent, mirroring how agent mode resolves.
function targetSelection(
  targets: readonly string[],
  options: TestingCliActionOptions,
  command: Command,
): TargetSelection | undefined {
  if (targets.length === 0) return undefined;
  const parentOptions = command.parent?.opts<TestingCliActionOptions>() ?? {};
  return { operands: targets, recursive: options.recursive === true || parentOptions.recursive === true };
}

function changedSelection(options: TestingCliActionOptions, command: Command): TestingChangedSelection | undefined {
  const parentOptions = command.parent?.opts<TestingCliActionOptions>() ?? {};
  const changed = options.changed === true || parentOptions.changed === true;
  if (!changed) return undefined;
  return {
    baseRef: options.base ?? parentOptions.base,
    staged: options.staged === true || parentOptions.staged === true,
  };
}

export interface TestingCliDependencies {
  readonly resolveProductDir: () => Promise<string>;
  readonly runTests: (
    productDir: string,
    passing: boolean,
    targets?: TargetSelection,
    changed?: TestingChangedSelection,
  ) => Promise<RecordedTestRun>;
  readonly runAgentTests: (
    productDir: string,
    passing: boolean,
    targets?: TargetSelection,
    changed?: TestingChangedSelection,
  ) => Promise<RecordedTestRun>;
  readonly writeStdout: (output: string) => void;
  readonly writeWarning: (warning: string | undefined) => void;
  readonly setExitCode: (exitCode: number) => void;
  readonly exit: (exitCode: number) => never;
}

function defaultTestingCliDependencies(invocation: CliInvocation): TestingCliDependencies {
  const writeWarning = (warning: string | undefined): void => {
    if (warning !== undefined) {
      invocation.io.writeStderr(`${warning}\n`);
    }
  };
  return {
    resolveProductDir: () => resolveTestProductDir(invocation.resolveEffectiveInvocationDir(), writeWarning),
    runTests: (productDir, passing, targets, changed) =>
      runTestsThroughCommand(productDir, passing, invocation.io, targets, changed),
    runAgentTests: (productDir, passing, targets, changed) =>
      runAgentTestsThroughCommand(productDir, passing, invocation.io, targets, changed),
    writeStdout: (output) => invocation.io.writeStdout(output),
    writeWarning,
    setExitCode: (exitCode) => invocation.io.setExitCode(exitCode),
    exit: (exitCode) => invocation.io.exit(exitCode),
  };
}

async function runTestingAction(
  deps: TestingCliDependencies,
  passing: boolean,
  options: TestingCliActionOptions,
  targets: TargetSelection | undefined,
  changed: TestingChangedSelection | undefined,
): Promise<void> {
  const productDir = await deps.resolveProductDir();
  if (options.agent === true) {
    const result = await deps.runAgentTests(productDir, passing, targets, changed);
    deps.writeStdout(formatAgentTestOutput(result));
    deps.setExitCode(result.dispatch.exitCode);
    return;
  }
  const result = await deps.runTests(productDir, passing, targets, changed);
  reportAndExit(result.dispatch, deps);
}

export function createTestingDomain(deps?: TestingCliDependencies): Domain {
  return {
    name: TESTING_CLI.commandName,
    description: TESTING_CLI.description,
    register: (program: Command, invocation: CliInvocation) => {
      const actionDeps = deps ?? defaultTestingCliDependencies(invocation);
      const testCmd = program.command(TESTING_CLI.commandName).description(TESTING_CLI.description);
      testCmd.option(TESTING_CLI.agentOption, TESTING_CLI.agentDescription);
      testCmd.option(
        `${TESTING_CLI.recursiveShortFlag}, ${TESTING_CLI.recursiveLongFlag}`,
        TESTING_CLI.recursiveDescription,
      );
      testCmd.option(TESTING_CLI.changedLongFlag, TESTING_CLI.changedDescription);
      testCmd.option(TESTING_CLI.stagedLongFlag, TESTING_CLI.stagedDescription);
      testCmd.option(`${TESTING_CLI.baseLongFlag} ${TESTING_CLI.baseOperand}`, TESTING_CLI.baseDescription);
      testCmd.argument(TESTING_CLI.targetsArgument, TESTING_CLI.targetsDescription);

      testCmd.action(async (targets: readonly string[], options: TestingCliActionOptions, command: Command) => {
        await runTestingAction(
          actionDeps,
          false,
          { agent: requestsAgentMode(options, command) },
          targetSelection(targets, options, command),
          changedSelection(options, command),
        );
      });

      testCmd
        .command(TESTING_CLI.passingSubcommand)
        .description(TESTING_CLI.passingDescription)
        .option(TESTING_CLI.agentOption, TESTING_CLI.agentDescription)
        .option(`${TESTING_CLI.recursiveShortFlag}, ${TESTING_CLI.recursiveLongFlag}`, TESTING_CLI.recursiveDescription)
        .option(TESTING_CLI.changedLongFlag, TESTING_CLI.changedDescription)
        .option(TESTING_CLI.stagedLongFlag, TESTING_CLI.stagedDescription)
        .option(`${TESTING_CLI.baseLongFlag} ${TESTING_CLI.baseOperand}`, TESTING_CLI.baseDescription)
        .argument(TESTING_CLI.targetsArgument, TESTING_CLI.targetsDescription)
        .action(async (targets: readonly string[], options: TestingCliActionOptions, command: Command) => {
          await runTestingAction(
            actionDeps,
            true,
            { agent: requestsAgentMode(options, command) },
            targetSelection(targets, options, command),
            changedSelection(options, command),
          );
        });
    },
  };
}

export const testingDomain: Domain = createTestingDomain();
