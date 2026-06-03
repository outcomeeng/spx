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
}

export interface TestDispatchDependencies {
  /** Supplies the detection and command-runner dependencies for a given language. */
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
}

// The full `spx test` run dispatches every discovered file; passing-scope
// filtering and runner-level node exclusion are not part of this surface.
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
  const testFiles = await discoverTestFiles(options.productDir);
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
