import { applyPathFilter, type PathFilterConfig } from "@/config/primitives";
import { aggregateTestExitCode, groupTestFiles, type LanguageTestGroup } from "@/domains/testing";
import type { TestingLanguageDescriptor, TestRunInvocation, TestRunnerDependencies } from "@/testing/languages/types";
import type { TestingRegistry } from "@/testing/registry";

import { discoverTestFiles } from "./discovery";

/** Outcome of a `spx test` dispatch: aggregate exit code, the dispatched groups, and the skipped files. */
export interface TestDispatchResult {
  readonly exitCode: number;
  readonly groups: readonly LanguageTestGroup[];
  readonly unmatched: readonly string[];
}

export interface TestDispatchOptions {
  readonly productDir: string;
  readonly registry: TestingRegistry;
  /** When present, discovered files are filtered by this scope before dispatch (`spx test passing`). */
  readonly passingScope?: PathFilterConfig;
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
  const testFiles = options.passingScope === undefined
    ? discovered
    : applyPathFilter(discovered, options.passingScope);
  const { groups, unmatched } = groupTestFiles(testFiles, options.registry.languages);

  const invocations: TestRunInvocation[] = [];
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
  }

  return { exitCode: aggregateTestExitCode(invocations), groups, unmatched };
}
