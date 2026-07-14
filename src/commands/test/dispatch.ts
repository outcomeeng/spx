import { applyPathFilter, normalizePathPrefix, type PathFilterConfig } from "@/config/primitives/path-filter";
import {
  aggregateTestExitCode,
  groupTestFiles,
  type LanguageTestGroup,
  resolveTargetedTestFiles,
  type TargetSelection,
} from "@/domains/test";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
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
  /** Changed source files whose language adapter declared no related-test capability. */
  readonly unresolvedChangedSourceFiles?: readonly string[];
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
  /** Changed source files that could not be resolved into related tests. */
  readonly unresolvedChangedSourceFiles?: readonly string[];
}

export interface TestDispatchDependencies {
  /** Supplies the detection and command-runner dependencies for a given language. */
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
}

const NO_EXCLUDED_NODE_PATHS: readonly string[] = [];
const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;
const SPEC_TREE_NODE_SEGMENT_PATTERN = /^\d+-.+\.(?:enabler|outcome)$/u;

function excludedNodePaths(passingScope: PathFilterConfig | undefined): readonly string[] {
  if (passingScope?.exclude === undefined) return NO_EXCLUDED_NODE_PATHS;
  const nodePaths = passingScope.exclude.flatMap((path) => {
    const normalized = normalizePathPrefix(path);
    if (!normalized.startsWith(SPEC_TREE_ROOT_PREFIX)) return [];
    const nodePath = normalized.slice(SPEC_TREE_ROOT_PREFIX.length);
    return nodePath.length > 0
        && nodePath.split("/").every((segment) => SPEC_TREE_NODE_SEGMENT_PATTERN.test(segment))
      ? [nodePath]
      : [];
  });
  return [...new Set(nodePaths)];
}

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
  const targeted = options.targets === undefined
    ? { selected: discovered, unresolved: [] as readonly string[] }
    : resolveTargetedTestFiles(discovered, options.targets);
  const testFiles = options.passingScope === undefined
    ? targeted.selected
    : applyPathFilter(targeted.selected, options.passingScope);
  const { groups, unmatched } = groupTestFiles(testFiles, options.registry.languages);
  const runnerExcludedNodePaths = excludedNodePaths(options.passingScope);

  const invocations: TestRunInvocation[] = [];
  const reports: TestRunnerReport[] = [];
  const outcomes: TestRunnerOutcome[] = [];
  for (const group of groups) {
    const invocation = await group.language.runTests(
      {
        projectRoot: options.productDir,
        testPaths: group.testPaths,
        excludedNodePaths: runnerExcludedNodePaths,
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
    exitCode: aggregateTestExitCode(
      invocations,
      unmatched.length + targeted.unresolved.length,
    ),
    groups,
    unmatched,
    unresolvedTargets: targeted.unresolved,
    unresolvedChangedSourceFiles: options.unresolvedChangedSourceFiles ?? [],
    reports,
    outcomes,
  };
}
