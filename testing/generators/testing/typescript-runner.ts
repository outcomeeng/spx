import * as fc from "fast-check";

import { PACKAGED_CLI_ARTIFACT } from "@/interfaces/cli/artifact";
import { TYPESCRIPT_TEST_FILE_SUFFIXES } from "@/test/languages/typescript";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const NON_MATCHING_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".test.js",
  ".test.jsx",
  ".md",
] as const;
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
const TEST_PATH_PAIR_LENGTH = 2;
const NODE_PATH_PAIR_LENGTH = 2;
const MIN_EXIT_CODE = 0;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_EXIT_CODE = 255;
const SOURCE_ROOT_PREFIX = "src/";
const TYPESCRIPT_ALIAS_PREFIX = "@/";
const TESTING_ALIAS_PREFIX = "@testing/";
const GENERATED_CONSUMER_PATH = "testing/harnesses/generated-artifact-consumer.ts";
const UNRELATED_SOURCE_PATH = "src/version.ts";

export interface ArtifactRelatedTestScenario {
  readonly changedSourcePath: string;
  readonly selectedTestPaths: readonly string[];
  readonly unrelatedTestPath: string;
  readonly candidateContents: ReadonlyMap<string, string>;
}

export const TYPESCRIPT_RUNNER_TEST_GENERATOR = {
  testFilePath: arbitraryTypeScriptTestFilePath,
  nonTestFilePath: arbitraryNonTestFilePath,
  nodePath: arbitraryNodePath,
  nodePathPair: arbitraryNodePathPair,
  nodePaths: arbitraryNodePaths,
  testPaths: arbitraryTestPaths,
  testPathPair: arbitraryTestPathPair,
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
  present: arbitraryPresence,
  artifactRelatedTests: arbitraryArtifactRelatedTestScenario,
} as const;

export function sampleTypescriptRunnerValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

function arbitraryNodeSegment(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: NODE_INDEX_MIN, max: NODE_INDEX_MAX }),
      CONFIG_TEST_GENERATOR.key(),
    )
    .map(([index, slug]) => `${index}-${slug}${NODE_SUFFIX}`);
}

function arbitraryNodePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSegment(), {
      minLength: MIN_NODE_DEPTH,
      maxLength: MAX_NODE_DEPTH,
    })
    .map((segments) => segments.join("/"));
}

function arbitrarySpecTreeTestStem(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryNodePath(), CONFIG_TEST_GENERATOR.key())
    .map(([nodePath, name]) => `${SPEC_ROOT}/${nodePath}/${TESTS_DIR}/${name}`);
}

function arbitraryTypeScriptTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySpecTreeTestStem(),
      fc.constantFrom(...TYPESCRIPT_TEST_FILE_SUFFIXES),
    )
    .map(([stem, extension]) => `${stem}${extension}`);
}

function arbitraryNonTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(
      arbitrarySpecTreeTestStem(),
      fc.constantFrom(...NON_MATCHING_EXTENSIONS),
    )
    .map(([stem, extension]) => `${stem}${extension}`);
}

function arbitraryNodePaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryNodePath(), {
    minLength: MIN_NODE_PATHS,
    maxLength: MAX_NODE_PATHS,
  });
}

function arbitraryNodePathPair(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .uniqueArray(arbitraryNodePath(), {
      minLength: NODE_PATH_PAIR_LENGTH,
      maxLength: NODE_PATH_PAIR_LENGTH,
    })
    .map(([first, second]) => [first, second] as const);
}

function arbitraryTestPaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitraryTypeScriptTestFilePath(), {
    minLength: MIN_TEST_PATHS,
    maxLength: MAX_TEST_PATHS,
  });
}

function arbitraryTestPathPair(): fc.Arbitrary<readonly [string, string]> {
  return fc
    .uniqueArray(arbitraryTypeScriptTestFilePath(), {
      minLength: TEST_PATH_PAIR_LENGTH,
      maxLength: TEST_PATH_PAIR_LENGTH,
    })
    .map(([first, second]) => [first, second] as const);
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

function sourceAlias(path: string): string {
  return `${TYPESCRIPT_ALIAS_PREFIX}${path.slice(SOURCE_ROOT_PREFIX.length).replace(/\.ts$/u, "")}`;
}

function testingAlias(path: string): string {
  return `${TESTING_ALIAS_PREFIX}${path.slice("testing/".length).replace(/\.ts$/u, "")}`;
}

function importStatement(specifier: string): string {
  return `import ${JSON.stringify(specifier)};`;
}

function arbitraryArtifactRelatedTestScenario(): fc.Arbitrary<ArtifactRelatedTestScenario> {
  return fc.uniqueArray(arbitraryTypeScriptTestFilePath(), { minLength: 3, maxLength: 3 }).map(
    ([directTestPath, transitiveTestPath, unrelatedTestPath]) => {
      const descriptorImport = importStatement(sourceAlias(PACKAGED_CLI_ARTIFACT.descriptorPath));
      return {
        changedSourcePath: PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0],
        selectedTestPaths: [directTestPath, transitiveTestPath],
        unrelatedTestPath,
        candidateContents: new Map([
          [
            TYPESCRIPT_MARKER,
            JSON.stringify({
              compilerOptions: {
                paths: {
                  "@/*": ["src/*"],
                  "@testing/*": ["testing/*"],
                },
              },
            }),
          ],
          [directTestPath, descriptorImport],
          [transitiveTestPath, importStatement(testingAlias(GENERATED_CONSUMER_PATH))],
          [unrelatedTestPath, importStatement(sourceAlias(UNRELATED_SOURCE_PATH))],
          [GENERATED_CONSUMER_PATH, descriptorImport],
          [UNRELATED_SOURCE_PATH, "export const unrelated = true;"],
        ]),
      };
    },
  );
}
