import * as fc from "fast-check";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const MATCHING_TEST_EXTENSIONS = [".test.ts", ".test.tsx"] as const;
const NON_MATCHING_EXTENSIONS = [".ts", ".tsx", ".test.js", ".test.jsx", ".md"] as const;
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
const MAX_TEST_PATHS = 5;
const MIN_EXIT_CODE = 0;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_EXIT_CODE = 255;

export const TYPESCRIPT_RUNNER_TEST_GENERATOR = {
  testFilePath: arbitraryTypeScriptTestFilePath,
  nonTestFilePath: arbitraryNonTestFilePath,
  nodePath: arbitraryNodePath,
  nodePaths: arbitraryNodePaths,
  testPaths: arbitraryTestPaths,
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
  present: arbitraryPresence,
} as const;

export function sampleTypescriptRunnerValue<T>(arbitrary: fc.Arbitrary<T>): T {
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

function arbitrarySpecTreeTestStem(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryNodePath(), CONFIG_TEST_GENERATOR.key())
    .map(([nodePath, name]) => `${SPEC_ROOT}/${nodePath}/${TESTS_DIR}/${name}`);
}

function arbitraryTypeScriptTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySpecTreeTestStem(), fc.constantFrom(...MATCHING_TEST_EXTENSIONS))
    .map(([stem, extension]) => `${stem}${extension}`);
}

function arbitraryNonTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySpecTreeTestStem(), fc.constantFrom(...NON_MATCHING_EXTENSIONS))
    .map(([stem, extension]) => `${stem}${extension}`);
}

function arbitraryNodePaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryNodePath(), { minLength: MIN_NODE_PATHS, maxLength: MAX_NODE_PATHS });
}

function arbitraryTestPaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryTypeScriptTestFilePath(), { minLength: MIN_TEST_PATHS, maxLength: MAX_TEST_PATHS });
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
