import * as fc from "fast-check";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const SPEC_ROOT = "spx";
const TESTS_DIR = "tests";
const NODE_SUFFIX = ".enabler";
const NODE_INDEX_MIN = 10;
const NODE_INDEX_MAX = 99;
const MIN_NODE_DEPTH = 1;
const MAX_NODE_DEPTH = 3;
const MIN_NODE_PATHS = 1;
const MAX_NODE_PATHS = 4;
const MIN_TEST_PATHS = 0;
const MIN_NON_EMPTY_TEST_PATHS = 1;
const MAX_TEST_PATHS = 5;
const MIN_EXIT_CODE = 0;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_EXIT_CODE = 255;

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
  testPaths: arbitraryTestPaths,
  nonEmptyTestPaths: arbitraryNonEmptyTestPaths,
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
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

function arbitraryNodeSegment(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: NODE_INDEX_MIN, max: NODE_INDEX_MAX }), CONFIG_TEST_GENERATOR.key())
    .map(([index, slug]) => `${index}-${slug}${NODE_SUFFIX}`);
}

function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSegment(), { minLength: MIN_NODE_DEPTH, maxLength: MAX_NODE_DEPTH })
    .map((segments) => segments.join("/"));
}

function arbitraryTestsDirectory(): fc.Arbitrary<string> {
  return arbitraryNodePath().map((nodePath) => `${SPEC_ROOT}/${nodePath}/${TESTS_DIR}`);
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

function arbitraryNodePaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryNodePath(), { minLength: MIN_NODE_PATHS, maxLength: MAX_NODE_PATHS });
}

function arbitraryTestPaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryPythonTestFilePath(), { minLength: MIN_TEST_PATHS, maxLength: MAX_TEST_PATHS });
}

function arbitraryNonEmptyTestPaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryPythonTestFilePath(), {
    minLength: MIN_NON_EMPTY_TEST_PATHS,
    maxLength: MAX_TEST_PATHS,
  });
}

function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_EXIT_CODE, max: MAX_EXIT_CODE });
}

function arbitraryNonZeroExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_NON_ZERO_EXIT_CODE, max: MAX_EXIT_CODE });
}

function arbitraryPresence(): fc.Arbitrary<boolean> {
  return fc.boolean();
}

function arbitraryInvocationGateScenario(): fc.Arbitrary<PythonRunnerInvocationGateScenario> {
  return fc.record({
    present: arbitraryPresence(),
    exitCode: arbitraryExitCode(),
  });
}
