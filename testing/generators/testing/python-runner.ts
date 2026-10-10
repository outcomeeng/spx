import * as fc from "fast-check";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryExitCode,
  arbitraryNeighbourReport,
  arbitraryNodePath,
  arbitraryNodePaths,
  arbitraryNonEmptyTestPaths,
  arbitraryNonZeroExitCode,
  arbitraryNonZeroExitWithTestPath,
  arbitraryPresence,
  arbitraryTestPaths,
  arbitraryTestsDirectory,
  arbitraryUniquePair,
} from "@testing/generators/testing/runner-paths";

// The pytest target shape declared by the spec (`test_*.py`), held here independently of the
// descriptor's own constants so a divergence between the descriptor and the spec fails the match test.
const MATCHING_TEST_PREFIX = "test_";
const MATCHING_TEST_EXTENSION = ".py";
// Extensions pytest never collects, so a `test_`-prefixed basename carrying one is not a target.
const NON_PYTEST_EXTENSIONS = [".txt", ".pyc", ".cfg", ".rst"] as const;

export const PYTHON_RUNNER_TEST_GENERATOR = {
  testFilePath: arbitraryPythonTestFilePath,
  nonTestFilePath: arbitraryNonPythonTestFilePath,
  nodePath: arbitraryNodePath,
  nodePaths: arbitraryNodePaths,
  testPaths: () => arbitraryTestPaths(arbitraryPythonTestFilePath()),
  nonEmptyTestPaths: () => arbitraryNonEmptyTestPaths(arbitraryPythonTestFilePath()),
  distinctTestPathPair: () => arbitraryUniquePair(arbitraryPythonTestFilePath()),
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
  nonZeroExitWithTestPath: () => arbitraryNonZeroExitWithTestPath(arbitraryPythonTestFilePath()),
  neighbourReport: () => arbitraryNeighbourReport(arbitraryPythonTestFilePath()),
  present: arbitraryPresence,
  invocationGateScenario: arbitraryInvocationGateScenario,
} as const;

export interface PythonRunnerInvocationGateScenario {
  readonly present: boolean;
  readonly exitCode: number;
}

export function samplePythonRunnerValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

function arbitraryPythonTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryTestsDirectory(), CONFIG_TEST_GENERATOR.key())
    .map(([directory, name]) => `${directory}/${MATCHING_TEST_PREFIX}${name}${MATCHING_TEST_EXTENSION}`);
}

function arbitraryNonPythonTestFilePath(): fc.Arbitrary<string> {
  return fc.oneof(
    // pytest prefix but a non-Python extension
    fc
      .tuple(arbitraryTestsDirectory(), CONFIG_TEST_GENERATOR.key(), fc.constantFrom(...NON_PYTEST_EXTENSIONS))
      .map(([directory, name, extension]) => `${directory}/${MATCHING_TEST_PREFIX}${name}${extension}`),
    // Python extension but no pytest prefix (config keys never start with `test_`)
    fc
      .tuple(arbitraryTestsDirectory(), CONFIG_TEST_GENERATOR.key())
      .map(([directory, name]) => `${directory}/${name}${MATCHING_TEST_EXTENSION}`),
  );
}

function arbitraryInvocationGateScenario(): fc.Arbitrary<PythonRunnerInvocationGateScenario> {
  return fc.record({
    present: arbitraryPresence(),
    exitCode: arbitraryExitCode(),
  });
}
