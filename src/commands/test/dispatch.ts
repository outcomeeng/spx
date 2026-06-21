import { applyPathFilter, type PathFilterConfig } from "@/config/primitives";
import {
  aggregateTestExitCode,
  groupTestFiles,
  type LanguageTestGroup,
  resolveTargetedTestFiles,
  type TargetSelection,
} from "@/domains/test";
import type {
  TestingLanguageDescriptor,
  TestRunCommandOutput,
  TestRunInvocation,
  TestRunnerDependencies,
} from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";
import type { TestRunnerOutcome } from "@/test/run-state";

import { discoverTestFiles } from "./discovery";

/**
 * Outcome of a `spx test` dispatch: aggregate exit code, the dispatched groups,
 * the skipped files, and the per-runner outcomes the recording path consumes. The
 * outcomes' test paths are the set this run covered.
 */
export interface TestDispatchResult {
  readonly exitCode: number;
  readonly groups: readonly LanguageTestGroup[];
  readonly unmatched: readonly string[];
  /** Operands that matched no discovered test file; non-empty makes the command fail. */
  readonly unresolvedTargets: readonly string[];
  readonly reports: readonly TestRunnerReport[];
  readonly outcomes: readonly TestRunnerOutcome[];
}

export interface TestRunnerReport {
  readonly runnerId: string;
  readonly testPaths: readonly string[];
  readonly exitCode: number;
  readonly output?: TestRunCommandOutput;
}

export interface TestDispatchOptions {
  readonly productDir: string;
  readonly registry: TestingRegistry;
  /** When present, discovered files are filtered by this scope before dispatch (`spx test passing`). */
  readonly passingScope?: PathFilterConfig;
  /** When present with operands, only the operand-selected files dispatch; passing scope still applies. */
  readonly targets?: TargetSelection;
}

export interface TestDispatchDependencies {
  /** Supplies the detection and command-runner dependencies for a given language. */
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
}

// Passing-scope filtering removes files before grouping; the dispatch passes no
// runner-level node exclusions, so each runner receives exactly the kept files.
const NO_EXCLUDED_NODE_PATHS: readonly string[] = [];

/**
 * Discovers the spec tree's test files, partitions them by registered language,
 * dispatches each group to its language runner through the injected runner
 * dependencies, and aggregates the runners' exit codes into one command result.
 */
export async function runTests(
  options: TestDispatchOptions,
  deps: TestDispatchDependencies,
): Promise<TestDispatchResult> {
  const discovered = await discoverTestFiles(options.productDir);
  // Explicit operands narrow the discovered set before passing-scope; with no
  // operands the full discovered set carries through unchanged.
  const targeted = options.targets !== undefined && options.targets.operands.length > 0
    ? resolveTargetedTestFiles(discovered, options.targets)
    : { selected: discovered, unresolved: [] as readonly string[] };
  const testFiles = options.passingScope === undefined
    ? targeted.selected
    : applyPathFilter(targeted.selected, options.passingScope);
  const { groups, unmatched } = groupTestFiles(testFiles, options.registry.languages);

  const invocations: TestRunInvocation[] = [];
  const reports: TestRunnerReport[] = [];
  const outcomes: TestRunnerOutcome[] = [];
  for (const group of groups) {
    const invocation = await group.language.runTests(
      {
        projectRoot: options.productDir,
        testPaths: group.testPaths,
        excludedNodePaths: NO_EXCLUDED_NODE_PATHS,
      },
      deps.runnerDepsFor(group.language),
    );
    invocations.push(invocation);
    // A gated-out runner (not invoked) produces no observed outcome to record.
    if (invocation.invoked) {
      reports.push({
        runnerId: group.language.name,
        testPaths: group.testPaths,
        exitCode: invocation.exitCode,
        ...(invocation.output === undefined ? {} : { output: invocation.output }),
      });
      outcomes.push({
        runnerId: group.language.name,
        testPaths: group.testPaths,
        exitCode: invocation.exitCode,
      });
    }
  }

  return {
    exitCode: aggregateTestExitCode(invocations, unmatched.length + targeted.unresolved.length),
    groups,
    unmatched,
    unresolvedTargets: targeted.unresolved,
    reports,
    outcomes,
  };
}
