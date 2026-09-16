import type { Command } from "commander";
import * as fc from "fast-check";

import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { TARGET_OPERAND } from "@/lib/test-targeting";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor, TestRunInvocation } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const NODE_INDEX_MIN = 10;
const NODE_INDEX_MAX = 99;
const MIN_NODE_DEPTH = 1;
const MAX_NODE_DEPTH = 3;
const MAX_EXIT_CODE = 255;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_UNSUPPORTED_SELECTION_COUNT = 6;
const NODE_PAIR_LENGTH = 2;
const MIN_OPERAND_LIST_LENGTH = 1;
const MAX_OPERAND_LIST_LENGTH = 4;
const MAX_TRAILING_SEPARATORS = 3;
const ABSOLUTE_PATH_PREFIX = "/";
const EMPTY_OPERAND = "";
const PARENT_DIRECTORY = "..";
const PARENT_SIBLING_SUFFIX = "-beside";
const GLOB_WILDCARD = "*";
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const COMMANDER_USER_PARSE_SOURCE = "user";

export type TestingCliCommanderParseSource = NonNullable<
  NonNullable<Parameters<Command["parseAsync"]>[1]>["from"]
>;

// Spec-tree path vocabulary owned by the spec-tree library, so generated fixture
// paths track the production constants instead of restating them.
const SPEC_ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const TESTS_DIRECTORY = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const ENABLER_SUFFIX = KIND_REGISTRY.enabler.suffix;
const SPEC_NODE_SUFFIXES = [KIND_REGISTRY.enabler.suffix, KIND_REGISTRY.outcome.suffix] as const;
const NODE_INDEX_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;

// The descriptors the dispatch composes; generated matching paths derive their
// shape from each descriptor's own patterns, and unmatched paths are filtered
// against these descriptors so non-coverage holds against the real matchers.
const DISPATCH_LANGUAGES: readonly TestingLanguageDescriptor[] = [typescriptTestingLanguage, pythonTestingLanguage];

export const TEST_DISPATCH_GENERATOR = {
  invocation: arbitraryInvocation,
  nodePath: arbitraryNodePath,
  distinctNodePaths: arbitraryDistinctNodePaths,
  nodeWithDescendant: arbitraryNodeWithDescendant,
  descendantOf: arbitraryDescendantOf,
  productRootSpellings: arbitraryProductRootSpellings,
  unresolvableOperands: arbitraryUnresolvableOperands,
  nodeWithOwnFile: arbitraryNodeWithOwnFile,
  distinctNodesWithOwnFiles: arbitraryDistinctNodesWithOwnFiles,
  nestedFiles: arbitraryNestedFiles,
  specFileUnder,
  testFileUnder: arbitraryTestFileUnder,
  supportFileUnder: arbitrarySupportFileUnder,
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

// The product-root-relative operand a caller passes for a node path after `--`,
// derived from the source-owned spec-tree root so tests never compose it by hand.
export function nodeOperand(nodePath: string): string {
  return `${SPEC_ROOT}${PATH_SEPARATOR}${nodePath}`;
}

export function specFileUnder(nodePath: string): string {
  const nodeSegment = nodePath.split(PATH_SEPARATOR).at(-1);
  if (nodeSegment === undefined) {
    throw new Error("specFileUnder: node path has no final segment");
  }
  const slugStart = nodeSegment.indexOf(NODE_INDEX_SEPARATOR);
  const suffix = SPEC_NODE_SUFFIXES.find((candidate) => nodeSegment.endsWith(candidate));
  if (slugStart < 0 || suffix === undefined) {
    throw new Error(`specFileUnder: invalid generated spec node segment: ${nodeSegment}`);
  }
  const slug = nodeSegment.slice(slugStart + NODE_INDEX_SEPARATOR.length, -suffix.length);
  return `${nodeOperand(nodePath)}${PATH_SEPARATOR}${slug}.md`;
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

// A node path paired with a strictly deeper descendant node path under it, so a
// node operand's own-vs-recursive scope can be exercised: the parent's own tests
// sit at `{parent}/tests/`, the descendant's at `{parent}/{segment}/tests/`.
function arbitraryNodeWithDescendant(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .tuple(arbitraryNodePath(), arbitraryNodeSegment())
    .map(([parent, childSegment]) => [parent, `${parent}${PATH_SEPARATOR}${childSegment}`] as const);
}

// A descendant node path under the given parent — the shape a recursive operand widens to and a
// default node operand leaves out, so a fixture can hold both without composing the path by hand.
function arbitraryDescendantOf(nodePath: string): fc.Arbitrary<string> {
  return arbitraryNodeSegment().map((segment) => `${nodePath}${PATH_SEPARATOR}${segment}`);
}

// Every spelling of the product root the operand vocabulary recognizes — the bare dot with each
// run of trailing separators up to the bound, and the root's own absolute path — as one list, so a
// case covers the whole enumeration in one run rather than one member per run.
function arbitraryProductRootSpellings(productDir: string): fc.Arbitrary<readonly string[]> {
  return fc
    .integer({ min: 1, max: MAX_TRAILING_SEPARATORS })
    .map((longest) => [
      ...Array.from(
        { length: longest + 1 },
        (_, count) => `${TARGET_OPERAND.PRODUCT_ROOT}${PATH_SEPARATOR.repeat(count)}`,
      ),
      productDir,
    ]);
}

// One operand of each spelling that names no path inside the product: nothing, the filesystem
// root, an absolute path beside the product, and a relative path climbing out of it — so a case
// covers every class in one run rather than one member per run.
function arbitraryUnresolvableOperands(productDir: string): fc.Arbitrary<readonly string[]> {
  return arbitraryNodePath().map((nodePath) => [
    EMPTY_OPERAND,
    ABSOLUTE_PATH_PREFIX,
    `${productDir}${PARENT_SIBLING_SUFFIX}${PATH_SEPARATOR}${nodePath}`,
    `${PARENT_DIRECTORY}${PATH_SEPARATOR}${nodePath}`,
  ]);
}

// The absolute spelling of a product-root-relative operand under the given product root.
export function absoluteOperand(productDir: string, operand: string): string {
  return `${productDir}${PATH_SEPARATOR}${operand}`;
}

/** A node path with one own test file of the language under its `tests/`. */
export interface NodeWithOwnFile {
  readonly node: string;
  readonly file: string;
}

/** A bounded list of distinct nodes with their own files, under one product root. */
export interface DistinctNodesWithOwnFiles {
  readonly productDir: string;
  readonly entries: readonly NodeWithOwnFile[];
}

/** A parent node, a descendant under it, and one own test file of the language in each, under one product root. */
export interface NestedFiles {
  readonly productDir: string;
  readonly parent: string;
  readonly descendant: string;
  readonly ownFile: string;
  readonly descendantFile: string;
}

// A node paired with one own test file under it, so a discovered set built from
// these has every entry reachable by its node operand.
function arbitraryNodeWithOwnFile(descriptor: TestingLanguageDescriptor): fc.Arbitrary<NodeWithOwnFile> {
  return arbitraryNodePath().chain((node) => arbitraryTestFileUnder(descriptor, node).map((file) => ({ node, file })));
}

// A bounded list of distinct nodes, each with its own test file — the operand-list
// domain over which resolution is order- and repetition-independent.
function arbitraryDistinctNodesWithOwnFiles(
  descriptor: TestingLanguageDescriptor,
): fc.Arbitrary<DistinctNodesWithOwnFiles> {
  return fc
    .tuple(
      CONFIG_TEST_GENERATOR.productDir(),
      fc.uniqueArray(arbitraryNodeWithOwnFile(descriptor), {
        minLength: MIN_OPERAND_LIST_LENGTH,
        maxLength: MAX_OPERAND_LIST_LENGTH,
        selector: (entry) => entry.node,
      }),
    )
    .map(([productDir, entries]) => ({ productDir, entries }));
}

// A parent and a descendant with one own test file each: a recursive parent operand
// and the descendant operand both match the descendant file, so their resolutions
// overlap on a distinct discovered candidate.
function arbitraryNestedFiles(descriptor: TestingLanguageDescriptor): fc.Arbitrary<NestedFiles> {
  return fc
    .tuple(CONFIG_TEST_GENERATOR.productDir(), arbitraryNodeWithDescendant())
    .chain(([productDir, [parent, descendant]]) =>
      arbitraryTestFileUnder(descriptor, parent).chain((ownFile) =>
        arbitraryTestFileUnder(descriptor, descendant).map((descendantFile) => ({
          productDir,
          parent,
          descendant,
          ownFile,
          descendantFile,
        }))
      )
    );
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

// A non-test source file of a registered language co-located under a node's
// `tests/` directory — a support/helper/fixture module sharing the language's
// source extension but not matching its test-file pattern, so the dispatch never
// claims it as a test. The extension is the test pattern's trailing extension, so
// it tracks the descriptor rather than restating a literal.
function arbitrarySupportFileUnder(
  descriptor: TestingLanguageDescriptor,
  nodePath: string,
): fc.Arbitrary<string> {
  const firstTestPattern = descriptor.testFilePatterns.at(0);
  if (firstTestPattern === undefined) {
    throw new Error("arbitrarySupportFileUnder: descriptor declares no testFilePatterns");
  }
  const sourceExtension = `.${firstTestPattern.split(".").pop() ?? ""}`;
  return CONFIG_TEST_GENERATOR.key()
    .map((name) => `${testsDirectoryFor(nodePath)}${PATH_SEPARATOR}${name}${sourceExtension}`)
    .filter((path) => !descriptor.matchesTestFile(path));
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
