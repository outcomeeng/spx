import * as fc from "fast-check";

import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

const PATH_SEPARATOR = "/";
const CURRENT_DIRECTORY_PREFIX = ".";
const PARENT_DIRECTORY_PREFIX = "..";
const TSCONFIG_WILDCARD = "*";
const SOURCE_ROOT = "src";
const TESTING_ROOT = "testing";
const SCRIPTS_ROOT = "scripts";
const ESLINT_RULES_ROOT = "eslint-rules";
const GENERATED_ROOT = "generated";
const HELPERS_SEGMENT = "helpers";
const INDEX_MODULE = ["index", "ts"].join(".");
const TYPESCRIPT_EXTENSION = ".ts";
const TS_CONFIG_EMPTY = "{}";
const TS_CONFIG_MALFORMED = String.fromCodePoint(123);
const SAMPLE_PACKAGE_JSON = "{}";
const SAMPLE_TSCONFIG_JSON = "{}";
const HASH_ALGORITHM_SHA256 = "SHA256";
const HASH_DIGEST_HEX = "hex";
const POSIX_SEPARATOR = "/";
const READ_FAILURE_MESSAGE = "fixture read failed";
const GIT_STAGED_PATH_MISSING_MESSAGE = "fatal: path 'fixture.ts' does not exist (neither on disk nor in the index)";
const GIT_STAGED_AMBIGUOUS_PATH_MESSAGE =
  "fatal: ambiguous argument ':fixture.ts': unknown revision or path not in the working tree.";
const GIT_STAGED_NOT_IN_INDEX_MESSAGE = "not in index";
const BEFORE_SOURCE_VALUE = 1;
const AFTER_SOURCE_VALUE = 2;
const BASE_COMMIT_MESSAGE = "base";
const BRANCH_COMMIT_MESSAGE = "branch change";

export interface ChangedSetAliasFixture {
  readonly sourcePath: string;
  readonly importSpecifier: string;
  readonly tsconfigPaths: Readonly<Record<string, readonly string[]>>;
}

export interface ChangedSetReadFailureFixture extends ChangedSetAliasFixture {
  readonly missingPath: string;
}

export interface ChangedSetFixturePaths {
  readonly sourcePath: string;
  readonly helperPath: string;
  readonly helperImportSpecifier: string;
  readonly testPath: string;
  readonly sourceIndexPath: string;
  readonly selectedTestPath: string;
  readonly untouchedTestPath: string;
}

export interface ChangedSetHarnessConsumersFixture {
  readonly sourcePaths: readonly string[];
  readonly selectedConsumers: Readonly<Record<string, string>>;
  readonly unrelatedConsumers: Readonly<Record<string, string>>;
  readonly tsconfigPaths: Readonly<Record<string, readonly string[]>>;
}

export interface ChangedSetAmbiguousCandidateFixture {
  readonly directSourcePath: string;
  readonly downstreamSourcePath: string;
  readonly helperPath: string;
  readonly importSpecifier: string;
  readonly downstreamImportSpecifier: string;
  readonly tsconfigPaths: Readonly<Record<string, readonly string[]>>;
}

export interface ChangedSetRenameFixture {
  readonly changedPaths: readonly string[];
  readonly parentTestPath: string;
  readonly childTestPath: string;
  readonly changedNoTestNode: string;
  readonly removedNoTestNode: string;
  readonly removedParentNode: string;
}

export interface ChangedSetFixtureContent {
  readonly emptyTsconfig: string;
  readonly malformedTsconfig: string;
  readonly packageJson: string;
  readonly tsconfigJson: string;
  readonly sha256Algorithm: string;
  readonly hexEncoding: typeof HASH_DIGEST_HEX;
  readonly posixSeparator: string;
  readonly readFailureMessage: string;
  readonly gitStagedPathMissingMessage: string;
  readonly gitStagedAmbiguousPathMessage: string;
  readonly gitStagedNotInIndexMessage: string;
  readonly beforeSourceValue: number;
  readonly afterSourceValue: number;
  readonly baseCommitMessage: string;
  readonly branchCommitMessage: string;
}

export const CHANGED_SET_PLANNING_GENERATOR = {
  aliasFixture: arbitraryAliasFixture,
  aliasFixtureSet: arbitraryAliasFixtureSet,
  fallbackAliasFixture: arbitraryFallbackAliasFixture,
  exactAliasFixture: arbitraryExactAliasFixture,
  harnessAliasFixture: arbitraryHarnessAliasFixture,
  indexAliasFixture: arbitraryIndexAliasFixture,
  readFailureFixture: arbitraryReadFailureFixture,
  fixturePaths: arbitraryFixturePaths,
  harnessConsumersFixture: arbitraryHarnessConsumersFixture,
  ambiguousCandidateFixture: arbitraryAmbiguousCandidateFixture,
  renameFixture: arbitraryRenameFixture,
  content: fixtureContent,
} as const;

export function sampleChangedSetPlanningValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleLiteralTestValue(arbitrary);
}

export function tsconfigWithPaths(paths: Readonly<Record<string, readonly string[]>>): string {
  return JSON.stringify({ compilerOptions: { paths } });
}

export function changedSetSourceFixture(value: number): string {
  return [`export const value = ${value};`, ""].join("\n");
}

export function changedSetSelectedTestFixture(importSpecifier: string, expectedValue: number): string {
  return [
    `import { expect, it } from "vitest";`,
    `import { value } from "${importSpecifier}";`,
    `it("passes", () => expect(value).toBe(${expectedValue}));`,
    "",
  ].join("\n");
}

export function changedSetPassingTestFixture(): string {
  return [
    `import { expect, it } from "vitest";`,
    `it("passes", () => expect(true).toBe(true));`,
    "",
  ].join("\n");
}

export function changedSetImportStatement(importSpecifier: string): string {
  return importStatement(importSpecifier);
}

export function fixtureContent(): ChangedSetFixtureContent {
  return {
    emptyTsconfig: TS_CONFIG_EMPTY,
    malformedTsconfig: TS_CONFIG_MALFORMED,
    packageJson: SAMPLE_PACKAGE_JSON,
    tsconfigJson: SAMPLE_TSCONFIG_JSON,
    sha256Algorithm: HASH_ALGORITHM_SHA256,
    hexEncoding: HASH_DIGEST_HEX,
    posixSeparator: POSIX_SEPARATOR,
    readFailureMessage: READ_FAILURE_MESSAGE,
    gitStagedPathMissingMessage: GIT_STAGED_PATH_MISSING_MESSAGE,
    gitStagedAmbiguousPathMessage: GIT_STAGED_AMBIGUOUS_PATH_MESSAGE,
    gitStagedNotInIndexMessage: GIT_STAGED_NOT_IN_INDEX_MESSAGE,
    beforeSourceValue: BEFORE_SOURCE_VALUE,
    afterSourceValue: AFTER_SOURCE_VALUE,
    baseCommitMessage: BASE_COMMIT_MESSAGE,
    branchCommitMessage: BRANCH_COMMIT_MESSAGE,
  };
}

function arbitraryFixturePaths(): fc.Arbitrary<ChangedSetFixturePaths> {
  return fc
    .record({
      sourceSlug: arbitraryDomainLiteral(),
      helperSlug: arbitraryDomainLiteral(),
      nodePaths: fc.uniqueArray(TEST_DISPATCH_GENERATOR.nodePath(), {
        minLength: 3,
        maxLength: 3,
      }),
    })
    .map((input) => {
      const [testNodePath, sourceNodePath, untouchedNodePath] = input.nodePaths;
      return {
        sourcePath: sourceFilePath(SOURCE_ROOT, input.sourceSlug),
        helperPath: [
          nodeTestsDirectory(testNodePath),
          HELPERS_SEGMENT,
          `${input.helperSlug}${TYPESCRIPT_EXTENSION}`,
        ].join(PATH_SEPARATOR),
        helperImportSpecifier: [
          CURRENT_DIRECTORY_PREFIX,
          HELPERS_SEGMENT,
          input.helperSlug,
        ].join(PATH_SEPARATOR),
        testPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
          typescriptTestingLanguage,
          testNodePath,
        )),
        sourceIndexPath: [SOURCE_ROOT, input.sourceSlug, INDEX_MODULE].join(PATH_SEPARATOR),
        selectedTestPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
          typescriptTestingLanguage,
          sourceNodePath,
        )),
        untouchedTestPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
          typescriptTestingLanguage,
          untouchedNodePath,
        )),
      };
    });
}

function arbitraryAliasFixtureSet(): fc.Arbitrary<readonly ChangedSetAliasFixture[]> {
  return fc.tuple(
    aliasFixture(SCRIPTS_ROOT),
    aliasFixture(ESLINT_RULES_ROOT),
    aliasFixture(SOURCE_ROOT),
  );
}

function arbitraryAliasFixture(): fc.Arbitrary<ChangedSetAliasFixture> {
  return fc.oneof(
    aliasFixture(SCRIPTS_ROOT),
    aliasFixture(ESLINT_RULES_ROOT),
    aliasFixture(SOURCE_ROOT),
    aliasFixture(TESTING_ROOT),
  );
}

function arbitraryHarnessAliasFixture(): fc.Arbitrary<ChangedSetAliasFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const harnessPath = [TESTING_ROOT, "harnesses", `${slug}${TYPESCRIPT_EXTENSION}`].join(PATH_SEPARATOR);
    return {
      sourcePath: harnessPath,
      importSpecifier: `@testing${PATH_SEPARATOR}harnesses${PATH_SEPARATOR}${slug}`,
      tsconfigPaths: {
        [`@testing${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
          `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${TESTING_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
        ],
      },
    };
  });
}

function arbitraryFallbackAliasFixture(): fc.Arbitrary<ChangedSetAliasFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const sourcePath = sourceFilePath(SOURCE_ROOT, slug);
    const aliasRoot = aliasRootFor(slug);
    return {
      sourcePath,
      importSpecifier: `${aliasRoot}${PATH_SEPARATOR}${slug}`,
      tsconfigPaths: {
        [`${aliasRoot}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
          `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${GENERATED_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
          `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${SOURCE_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
        ],
      },
    };
  });
}

function arbitraryIndexAliasFixture(): fc.Arbitrary<ChangedSetAliasFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const sourcePath = [SOURCE_ROOT, slug, INDEX_MODULE].join(PATH_SEPARATOR);
    const aliasRoot = aliasRootFor(slug);
    return {
      sourcePath,
      importSpecifier: aliasRoot,
      tsconfigPaths: {
        [aliasRoot]: [`${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${SOURCE_ROOT}${PATH_SEPARATOR}${slug}`],
      },
    };
  });
}

function arbitraryExactAliasFixture(): fc.Arbitrary<ChangedSetAliasFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const sourcePath = [SOURCE_ROOT, slug, INDEX_MODULE].join(PATH_SEPARATOR);
    const alias = aliasRootFor(slug);
    return {
      sourcePath,
      importSpecifier: `${alias}-dom`,
      tsconfigPaths: {
        [alias]: [`${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${sourcePath}`],
      },
    };
  });
}

function arbitraryReadFailureFixture(): fc.Arbitrary<ChangedSetReadFailureFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const sourcePath = sourceFilePath(SOURCE_ROOT, slug);
    const aliasRoot = aliasRootFor(slug);
    const missingPath = [SOURCE_ROOT, `${slug}-missing${TYPESCRIPT_EXTENSION}`].join(PATH_SEPARATOR);
    return {
      sourcePath,
      importSpecifier: `${aliasRoot}${PATH_SEPARATOR}${slug}-missing`,
      missingPath,
      tsconfigPaths: {
        [`${aliasRoot}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
          `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${SOURCE_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
        ],
      },
    };
  });
}

function arbitraryHarnessConsumersFixture(): fc.Arbitrary<ChangedSetHarnessConsumersFixture> {
  return fc
    .record({
      slugs: fc.uniqueArray(arbitraryDomainLiteral(), {
        minLength: 4,
        maxLength: 4,
      }),
      nodePaths: fc.uniqueArray(TEST_DISPATCH_GENERATOR.nodePath(), {
        minLength: 4,
        maxLength: 4,
      }),
    })
    .map((input) => {
      const [firstSlug, secondSlug, firstUnrelatedSlug, secondUnrelatedSlug] = input.slugs;
      const [firstNodePath, secondNodePath, firstUnrelatedNodePath, secondUnrelatedNodePath] = input.nodePaths;
      const first = harnessAliasFixtureFromSlug(firstSlug);
      const second = harnessAliasFixtureFromSlug(secondSlug);
      const firstSelectedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
        typescriptTestingLanguage,
        firstNodePath,
      ));
      const secondSelectedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
        typescriptTestingLanguage,
        secondNodePath,
      ));
      const firstUnrelatedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
        typescriptTestingLanguage,
        firstUnrelatedNodePath,
      ));
      const secondUnrelatedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
        typescriptTestingLanguage,
        secondUnrelatedNodePath,
      ));
      return {
        sourcePaths: [first.sourcePath, second.sourcePath],
        selectedConsumers: {
          [firstSelectedPath]: importStatement(first.importSpecifier),
          [secondSelectedPath]: importStatement(second.importSpecifier),
        },
        unrelatedConsumers: {
          [firstUnrelatedPath]: importStatement(
            `@testing${PATH_SEPARATOR}harnesses${PATH_SEPARATOR}${firstUnrelatedSlug}`,
          ),
          [secondUnrelatedPath]: importStatement(
            `@testing${PATH_SEPARATOR}harnesses${PATH_SEPARATOR}${secondUnrelatedSlug}`,
          ),
        },
        tsconfigPaths: {
          ...first.tsconfigPaths,
          ...second.tsconfigPaths,
        },
      };
    });
}

function arbitraryAmbiguousCandidateFixture(): fc.Arbitrary<ChangedSetAmbiguousCandidateFixture> {
  return fc
    .uniqueArray(arbitraryDomainLiteral(), {
      minLength: 2,
      maxLength: 2,
    })
    .map(([directSlug, downstreamSlug]) => {
      const aliasRoot = aliasRootFor(directSlug);
      return {
        directSourcePath: sourceFilePath(SOURCE_ROOT, directSlug),
        downstreamSourcePath: sourceFilePath(SOURCE_ROOT, downstreamSlug),
        helperPath: [TESTING_ROOT, "harnesses", `${directSlug}${TYPESCRIPT_EXTENSION}`].join(PATH_SEPARATOR),
        importSpecifier: `${aliasRoot}${PATH_SEPARATOR}${directSlug}`,
        downstreamImportSpecifier: [
          PARENT_DIRECTORY_PREFIX,
          PARENT_DIRECTORY_PREFIX,
          SOURCE_ROOT,
          downstreamSlug,
        ].join(PATH_SEPARATOR),
        tsconfigPaths: {
          [`${aliasRoot}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
            `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${SOURCE_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
            `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${TESTING_ROOT}${PATH_SEPARATOR}harnesses${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
          ],
        },
      };
    });
}

function arbitraryRenameFixture(): fc.Arbitrary<ChangedSetRenameFixture> {
  return fc
    .uniqueArray(TEST_DISPATCH_GENERATOR.nodePath(), {
      minLength: 2,
      maxLength: 2,
    })
    .map(([changedParentNode, removedParentNode]) => {
      const changedNoTestNode = `${changedParentNode}${PATH_SEPARATOR}21-instructions.enabler`;
      const changedChildNode = `${changedParentNode}${PATH_SEPARATOR}32-tested-child.enabler`;
      const removedNoTestNode = `${removedParentNode}${PATH_SEPARATOR}21-instructions.enabler`;
      return {
        changedPaths: [
          specFileUnder(removedParentNode),
          specFileUnder(removedNoTestNode),
          specFileUnder(changedParentNode),
          specFileUnder(changedNoTestNode),
          specFileUnder(changedChildNode),
        ],
        parentTestPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
          typescriptTestingLanguage,
          changedParentNode,
        )),
        childTestPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(
          typescriptTestingLanguage,
          changedChildNode,
        )),
        changedNoTestNode: nodeOperand(changedNoTestNode),
        removedNoTestNode: nodeOperand(removedNoTestNode),
        removedParentNode: nodeOperand(removedParentNode),
      };
    });
}

function harnessAliasFixtureFromSlug(slug: string): ChangedSetAliasFixture {
  const harnessPath = [TESTING_ROOT, "harnesses", `${slug}${TYPESCRIPT_EXTENSION}`].join(PATH_SEPARATOR);
  return {
    sourcePath: harnessPath,
    importSpecifier: `@testing${PATH_SEPARATOR}harnesses${PATH_SEPARATOR}${slug}`,
    tsconfigPaths: {
      [`@testing${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
        `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${TESTING_ROOT}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
      ],
    },
  };
}

function aliasFixture(root: string): fc.Arbitrary<ChangedSetAliasFixture> {
  return arbitraryDomainLiteral().map((slug) => {
    const sourcePath = sourceFilePath(root, slug);
    const aliasRoot = aliasRootFor(root);
    return {
      sourcePath,
      importSpecifier: `${aliasRoot}${PATH_SEPARATOR}${slug}`,
      tsconfigPaths: {
        [`${aliasRoot}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`]: [
          `${CURRENT_DIRECTORY_PREFIX}${PATH_SEPARATOR}${root}${PATH_SEPARATOR}${TSCONFIG_WILDCARD}`,
        ],
      },
    };
  });
}

function importStatement(importSpecifier: string): string {
  return `import { subject } from "${importSpecifier}";`;
}

function aliasRootFor(value: string): string {
  return `@${value}`;
}

function sourceFilePath(root: string, slug: string): string {
  return [root, `${slug}${TYPESCRIPT_EXTENSION}`].join(PATH_SEPARATOR);
}

function nodeTestsDirectory(nodePath: string): string {
  return ["spx", nodePath, "tests"].join(PATH_SEPARATOR);
}

function specFileUnder(nodePath: string): string {
  const nodeSegment = nodePath.split(PATH_SEPARATOR).at(-1) ?? "";
  const specSlug = nodeSegment.replace(/^\d+-/, "").replace(/\.(?:enabler|outcome)$/, "");
  return [nodeOperand(nodePath), `${specSlug}.md`].join(PATH_SEPARATOR);
}
