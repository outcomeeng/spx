import * as fc from "fast-check";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

// The spec-tree path, exit-code, and neighbour-report arbitraries both language runner generators
// share: each language generator supplies its own test-file-path arbitrary and consumes the rest.

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
const PAIR_LENGTH = 2;
const MIN_EXIT_CODE = 0;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_EXIT_CODE = 255;

export type ReportedFileVerdict = typeof TEST_PATH_VERDICT.PASSED | typeof TEST_PATH_VERDICT.FAILED;

export interface NeighbourReport {
  readonly testPath: string;
  readonly neighbourPath: string;
  readonly exactVerdict: ReportedFileVerdict;
  readonly neighbourVerdict: ReportedFileVerdict;
}

export function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSegment(), { minLength: MIN_NODE_DEPTH, maxLength: MAX_NODE_DEPTH })
    .map((segments) => segments.join("/"));
}

export function arbitraryTestsDirectory(): fc.Arbitrary<string> {
  return arbitraryNodePath().map((nodePath) => `${SPEC_ROOT}/${nodePath}/${TESTS_DIR}`);
}

/** A spec-tree test file path without its file suffix. */
export function arbitrarySpecTreeTestStem(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryTestsDirectory(), CONFIG_TEST_GENERATOR.key())
    .map(([directory, name]) => `${directory}/${name}`);
}

export function arbitraryNodePaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryNodePath(), { minLength: MIN_NODE_PATHS, maxLength: MAX_NODE_PATHS });
}

export function arbitraryNodePathPair(): fc.Arbitrary<readonly [string, string]> {
  return arbitraryUniquePair(arbitraryNodePath());
}

export function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_EXIT_CODE, max: MAX_EXIT_CODE });
}

export function arbitraryNonZeroExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_NON_ZERO_EXIT_CODE, max: MAX_EXIT_CODE });
}

export function arbitraryPresence(): fc.Arbitrary<boolean> {
  return fc.boolean();
}

export function arbitraryTestPaths(testFilePath: fc.Arbitrary<string>): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(testFilePath, { minLength: MIN_TEST_PATHS, maxLength: MAX_TEST_PATHS });
}

export function arbitraryNonEmptyTestPaths(testFilePath: fc.Arbitrary<string>): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(testFilePath, { minLength: MIN_NON_EMPTY_TEST_PATHS, maxLength: MAX_TEST_PATHS });
}

export function arbitraryUniquePair<T>(element: fc.Arbitrary<T>): fc.Arbitrary<readonly [T, T]> {
  return fc
    .uniqueArray(element, { minLength: PAIR_LENGTH, maxLength: PAIR_LENGTH })
    .map(([first, second]) => [first, second] as unknown as readonly [T, T]);
}

export function arbitraryNonZeroExitWithTestPath(
  testFilePath: fc.Arbitrary<string>,
): fc.Arbitrary<{ readonly exitCode: number; readonly testPath: string }> {
  return fc.record({ exitCode: arbitraryNonZeroExitCode(), testPath: testFilePath });
}

/**
 * A supplied test path, a second path that ends with it without being it (the supplied path
 * under one more leading segment), and two distinct file verdicts — one for the supplied path's
 * own report entry and one for the neighbouring entry.
 */
export function arbitraryNeighbourReport(testFilePath: fc.Arbitrary<string>): fc.Arbitrary<NeighbourReport> {
  return fc
    .tuple(
      testFilePath,
      CONFIG_TEST_GENERATOR.key(),
      fc.constantFrom(
        [TEST_PATH_VERDICT.PASSED, TEST_PATH_VERDICT.FAILED] as const,
        [TEST_PATH_VERDICT.FAILED, TEST_PATH_VERDICT.PASSED] as const,
      ),
    )
    .map(([testPath, enclosingSegment, [exactVerdict, neighbourVerdict]]) => ({
      testPath,
      neighbourPath: `${enclosingSegment}/${testPath}`,
      exactVerdict,
      neighbourVerdict,
    }));
}

function arbitraryNodeSegment(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: NODE_INDEX_MIN, max: NODE_INDEX_MAX }), CONFIG_TEST_GENERATOR.key())
    .map(([index, slug]) => `${index}-${slug}${NODE_SUFFIX}`);
}
