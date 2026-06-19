import type { Command } from "commander";
import * as fc from "fast-check";

import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { pythonTestingLanguage } from "@/testing/languages/python";
import type { TestingLanguageDescriptor, TestRunInvocation } from "@/testing/languages/types";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const NODE_INDEX_MIN = 10;
const NODE_INDEX_MAX = 99;
const MIN_NODE_DEPTH = 1;
const MAX_NODE_DEPTH = 3;
const MAX_EXIT_CODE = 255;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_UNSUPPORTED_SELECTION_COUNT = 6;
const NODE_PAIR_LENGTH = 2;
const GLOB_WILDCARD = "*";
const PATH_SEPARATOR = "/";
const COMMANDER_USER_PARSE_SOURCE = "user";

export type TestingCliCommanderParseSource = NonNullable<
  NonNullable<Parameters<Command["parseAsync"]>[1]>["from"]
>;

// Spec-tree path vocabulary owned by the spec-tree library, so generated fixture
// paths track the production constants instead of restating them.
const SPEC_ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const TESTS_DIRECTORY = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const ENABLER_SUFFIX = KIND_REGISTRY.enabler.suffix;

// The descriptors the dispatch composes; generated matching paths derive their
// shape from each descriptor's own patterns, and unmatched paths are filtered
// against these descriptors so non-coverage holds against the real matchers.
const DISPATCH_LANGUAGES: readonly TestingLanguageDescriptor[] = [typescriptTestingLanguage, pythonTestingLanguage];

export const TEST_DISPATCH_GENERATOR = {
  invocation: arbitraryInvocation,
  nodePath: arbitraryNodePath,
  distinctNodePaths: arbitraryDistinctNodePaths,
  testFileUnder: arbitraryTestFileUnder,
  unmatchedTestFileUnder: arbitraryUnmatchedTestFileUnder,
  testFilePath: arbitraryTestFilePath,
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
  unsupportedSelectionCount: arbitraryUnsupportedSelectionCount,
} as const;

export function sampleDispatchValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

export function testingCliCommanderParseSource(): TestingCliCommanderParseSource {
  return COMMANDER_USER_PARSE_SOURCE;
}

function arbitraryNodeSegment(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: NODE_INDEX_MIN, max: NODE_INDEX_MAX }), CONFIG_TEST_GENERATOR.key())
    .map(([index, slug]) => `${index}-${slug}${ENABLER_SUFFIX}`);
}

function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSegment(), { minLength: MIN_NODE_DEPTH, maxLength: MAX_NODE_DEPTH })
    .map((segments) => segments.join(PATH_SEPARATOR));
}

// True when `prefix` equals `path` or is an ancestor segment of it — the relation
// under which a passing-scope exclusion of `prefix` also covers `path`.
function isNodePathPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}${PATH_SEPARATOR}`);
}

function arbitraryDistinctNodePaths(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .uniqueArray(arbitraryNodePath(), { minLength: NODE_PAIR_LENGTH, maxLength: NODE_PAIR_LENGTH })
    .map(([first, second]) => [first, second] as const)
    .filter(([first, second]) => !isNodePathPrefix(first, second) && !isNodePathPrefix(second, first));
}

function testsDirectoryFor(nodePath: string): string {
  return [SPEC_ROOT, nodePath, TESTS_DIRECTORY].join(PATH_SEPARATOR);
}

function arbitraryTestFileUnder(
  descriptor: TestingLanguageDescriptor,
  nodePath: string,
): fc.Arbitrary<string> {
  return fc
    .tuple(fc.constantFrom(...descriptor.testFilePatterns), CONFIG_TEST_GENERATOR.key())
    .map(([pattern, name]) => `${testsDirectoryFor(nodePath)}${PATH_SEPARATOR}${pattern.replace(GLOB_WILDCARD, name)}`);
}

function arbitraryUnmatchedTestFileUnder(nodePath: string): fc.Arbitrary<string> {
  return fc
    .tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key())
    .map(([name, extension]) => `${testsDirectoryFor(nodePath)}${PATH_SEPARATOR}${name}.${extension}`)
    .filter((path) => DISPATCH_LANGUAGES.every((descriptor) => !descriptor.matchesTestFile(path)));
}

function arbitraryTestFilePath(): fc.Arbitrary<string> {
  return fc
    .constantFrom(...DISPATCH_LANGUAGES)
    .chain((descriptor) => arbitraryNodePath().chain((nodePath) => arbitraryTestFileUnder(descriptor, nodePath)));
}

function arbitraryInvocation(): fc.Arbitrary<TestRunInvocation> {
  return fc.oneof(
    fc.record({ invoked: fc.constant(false) }),
    fc.record({ invoked: fc.constant(true), exitCode: arbitraryExitCode() }),
  );
}

function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: MAX_EXIT_CODE });
}

function arbitraryNonZeroExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_NON_ZERO_EXIT_CODE, max: MAX_EXIT_CODE });
}

function arbitraryUnsupportedSelectionCount(): fc.Arbitrary<number> {
  return fc.nat({ max: MAX_UNSUPPORTED_SELECTION_COUNT });
}
