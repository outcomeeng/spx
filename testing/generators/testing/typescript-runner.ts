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
const ARTIFACT_MAPPING_CASES_PER_RELATION = 2;
const ARTIFACT_MAPPING_RELATION_COUNT = 3;
const ARTIFACT_MAPPING_CASE_COUNT = ARTIFACT_MAPPING_CASES_PER_RELATION * ARTIFACT_MAPPING_RELATION_COUNT;
const MIN_EXIT_CODE = 0;
const MIN_NON_ZERO_EXIT_CODE = 1;
const MAX_EXIT_CODE = 255;
const SOURCE_ROOT_PREFIX = "src/";
const TYPESCRIPT_ALIAS_PREFIX = "@/";
const TESTING_ALIAS_PREFIX = "@testing/";
const GENERATED_CONSUMER_PATH = "testing/harnesses/generated-artifact-consumer.ts";
const UNRELATED_SOURCE_PATH = "src/version.ts";

export interface ArtifactRelatedTestMappingCase {
  readonly name: string;
  readonly changedSourcePath: string;
  readonly candidateTestPath: string;
  readonly expectedTestPaths: readonly string[];
  readonly expectedResolvedSourcePaths: readonly string[];
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
  artifactRelatedTestMappings: artifactRelatedTestMappingCases,
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

function typescriptMarkerContents(): string {
  return JSON.stringify({
    compilerOptions: {
      paths: {
        "@/*": ["src/*"],
        "@testing/*": ["testing/*"],
      },
    },
  });
}

function directArtifactMappingCase(testPath: string): ArtifactRelatedTestMappingCase {
  return {
    name: `direct descriptor import ${testPath}`,
    changedSourcePath: PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0],
    candidateTestPath: testPath,
    expectedTestPaths: [testPath],
    expectedResolvedSourcePaths: [PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0]],
    candidateContents: new Map([
      [TYPESCRIPT_MARKER, typescriptMarkerContents()],
      [testPath, importStatement(sourceAlias(PACKAGED_CLI_ARTIFACT.descriptorPath))],
    ]),
  };
}

function transitiveArtifactMappingCase(testPath: string): ArtifactRelatedTestMappingCase {
  return {
    name: `transitive descriptor import ${testPath}`,
    changedSourcePath: PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0],
    candidateTestPath: testPath,
    expectedTestPaths: [testPath],
    expectedResolvedSourcePaths: [PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0]],
    candidateContents: new Map([
      [TYPESCRIPT_MARKER, typescriptMarkerContents()],
      [testPath, importStatement(testingAlias(GENERATED_CONSUMER_PATH))],
      [GENERATED_CONSUMER_PATH, importStatement(sourceAlias(PACKAGED_CLI_ARTIFACT.descriptorPath))],
    ]),
  };
}

function unrelatedArtifactMappingCase(testPath: string): ArtifactRelatedTestMappingCase {
  return {
    name: `unrelated candidate ${testPath}`,
    changedSourcePath: PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths[0],
    candidateTestPath: testPath,
    expectedTestPaths: [],
    expectedResolvedSourcePaths: [],
    candidateContents: new Map([
      [TYPESCRIPT_MARKER, typescriptMarkerContents()],
      [testPath, importStatement(sourceAlias(UNRELATED_SOURCE_PATH))],
      [UNRELATED_SOURCE_PATH, "export const unrelated = true;"],
    ]),
  };
}

/** Two generated candidates for each source-owned artifact reachability relation. */
function artifactRelatedTestMappingCases(): readonly ArtifactRelatedTestMappingCase[] {
  const paths = sampleTypescriptRunnerValue(
    fc.uniqueArray(arbitraryTypeScriptTestFilePath(), {
      minLength: ARTIFACT_MAPPING_CASE_COUNT,
      maxLength: ARTIFACT_MAPPING_CASE_COUNT,
    }),
  );
  return [
    ...paths.slice(0, ARTIFACT_MAPPING_CASES_PER_RELATION).map(directArtifactMappingCase),
    ...paths
      .slice(ARTIFACT_MAPPING_CASES_PER_RELATION, ARTIFACT_MAPPING_CASES_PER_RELATION * 2)
      .map(transitiveArtifactMappingCase),
    ...paths
      .slice(ARTIFACT_MAPPING_CASES_PER_RELATION * 2)
      .map(unrelatedArtifactMappingCase),
  ];
}
