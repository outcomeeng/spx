import * as fc from "fast-check";

import { TYPESCRIPT_TEST_FILE_SUFFIXES } from "@/test/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryExitCode,
  arbitraryNeighbourReport,
  arbitraryNodePath,
  arbitraryNodePathPair,
  arbitraryNodePaths,
  arbitraryNonZeroExitCode,
  arbitraryNonZeroExitWithTestPath,
  arbitraryPresence,
  arbitrarySpecTreeTestStem,
  arbitraryTestPaths,
  arbitraryUniquePair,
} from "@testing/generators/testing/runner-paths";

const NON_MATCHING_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".test.js",
  ".test.jsx",
  ".md",
] as const;

/**
 * The manifest fields a package manager installs for a package's consumers — held here
 * independently of the harness reader, so a reader that stops reading one of them fails the
 * consuming test instead of agreeing with it.
 */
const CONSUMER_INSTALL_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"] as const;
/** The manifest field naming the package. */
const MANIFEST_NAME_FIELD = "name";

export const TYPESCRIPT_RUNNER_TEST_GENERATOR = {
  testFilePath: arbitraryTypeScriptTestFilePath,
  manifestInstalling: arbitraryManifestInstalling,
  nonTestFilePath: arbitraryNonTestFilePath,
  nodePath: arbitraryNodePath,
  nodePathPair: arbitraryNodePathPair,
  nodePaths: arbitraryNodePaths,
  testPaths: () => arbitraryTestPaths(arbitraryTypeScriptTestFilePath()),
  testPathPair: () => arbitraryUniquePair(arbitraryTypeScriptTestFilePath()),
  exitCode: arbitraryExitCode,
  nonZeroExitCode: arbitraryNonZeroExitCode,
  nonZeroExitWithTestPath: () => arbitraryNonZeroExitWithTestPath(arbitraryTypeScriptTestFilePath()),
  neighbourReport: () => arbitraryNeighbourReport(arbitraryTypeScriptTestFilePath()),
  present: arbitraryPresence,
} as const;

export function sampleTypescriptRunnerValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

function arbitraryTypeScriptTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySpecTreeTestStem(), fc.constantFrom(...TYPESCRIPT_TEST_FILE_SUFFIXES))
    .map(([stem, extension]) => `${stem}${extension}`);
}

function arbitraryNonTestFilePath(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySpecTreeTestStem(), fc.constantFrom(...NON_MATCHING_EXTENSIONS))
    .map(([stem, extension]) => `${stem}${extension}`);
}

/**
 * A package manifest, as text, that installs the named package for its consumers through one
 * of the consumer-install fields at some version — the shape a manifest violating the
 * no-runtime-Vitest rule takes.
 */
function arbitraryManifestInstalling(packageName: string): fc.Arbitrary<string> {
  return fc
    .tuple(fc.constantFrom(...CONSUMER_INSTALL_FIELDS), CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key())
    .map(([field, manifestName, version]) =>
      JSON.stringify({ [MANIFEST_NAME_FIELD]: manifestName, [field]: { [packageName]: version } })
    );
}
