import { groupTestFiles } from "@/domains/test";

import { findSatisfyingRecordedRun } from "./recorded-run";
import {
  executePlannedTestsRun,
  type PlannedTestsRun,
  planTestsRun,
  type RecordedTestRun,
  type ReusedTestRun,
  type RunTestsCommandOptions,
  TEST_RESULT_KIND,
  type TestCommandDependencies,
  type TestsCommandResult,
  unresolvedChangedSourceFilesOf,
} from "./run-command";

/**
 * Runs the spec tree's tests — every discovered file, or only the configured
 * passing scope under `passing` — through the registry, then records last-run
 * evidence for the run. A request that a recorded passed run satisfies returns
 * that run's verdicts instead, invoking no runner and writing no run file, unless
 * the caller requires execution.
 */
export function runTestsCommand(
  options: RunTestsCommandOptions & { readonly requireExecution: true },
  deps: TestCommandDependencies,
): Promise<RecordedTestRun>;
export function runTestsCommand(
  options: RunTestsCommandOptions,
  deps: TestCommandDependencies,
): Promise<TestsCommandResult>;
export async function runTestsCommand(
  options: RunTestsCommandOptions,
  deps: TestCommandDependencies,
): Promise<TestsCommandResult> {
  const plan = await planTestsRun(options, deps);
  if (options.requireExecution !== true) {
    const reused = await reuseRecordedRun(plan, deps);
    if (reused !== undefined) return reused;
  }
  return await executePlannedTestsRun(plan, deps);
}

// A request reuses a recorded run only when its dispatch would report nothing but
// the verdicts of the selected files: every operand resolved, every selected file
// belongs to a registered language, and no changed source file went unresolved.
async function reuseRecordedRun(
  plan: PlannedTestsRun,
  deps: TestCommandDependencies,
): Promise<ReusedTestRun | undefined> {
  const { options, selection } = plan;
  if (selection.selected.length === 0 || selection.unresolvedTargets.length > 0) return undefined;
  if (unresolvedChangedSourceFilesOf(plan).length > 0) return undefined;
  if (groupTestFiles(selection.selected, deps.registry.languages).unmatched.length > 0) return undefined;

  const lookup = await findSatisfyingRecordedRun(
    { productDir: options.productDir, selectedPaths: selection.selected },
    deps,
  );
  if (!lookup.satisfied) return undefined;

  const selectedPaths = new Set(selection.selected);
  return {
    kind: TEST_RESULT_KIND.REUSED,
    runFile: { runFileName: lookup.run.runFileName, runFilePath: lookup.run.runFilePath },
    recorded: lookup.run.state,
    outcomes: lookup.run.state.runnerOutcomes.flatMap((outcome) => {
      const testPaths = outcome.testPaths.filter((path) => selectedPaths.has(path));
      if (testPaths.length === 0) return [];
      return [{
        ...outcome,
        testPaths,
        pathVerdicts: outcome.pathVerdicts.filter((pathVerdict) => selectedPaths.has(pathVerdict.testPath)),
      }];
    }),
  };
}
