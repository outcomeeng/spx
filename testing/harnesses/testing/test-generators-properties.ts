import { sep } from "node:path/posix";

import * as fc from "fast-check";

import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { testingRegistry } from "@/test/registry";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

interface GeneratedDispatchFiles {
  readonly descriptor: TestingLanguageDescriptor;
  readonly nodePath: string;
  readonly supportFile: string;
  readonly testFile: string;
}

const VALID_NODE_SEGMENT_PATTERN = /^\d{2}-.+\.(?:enabler|outcome)$/u;
const TEST_PATTERN_WILDCARD = "*";

function isPathPrefix(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}${sep}`);
}

function expectDistinctNonPrefixNodePaths(
  paths: readonly [string, string],
): void {
  const [first, second] = paths;
  expect(first).not.toBe(second);
  expect(isPathPrefix(first, second)).toBe(false);
  expect(isPathPrefix(second, first)).toBe(false);
  for (const path of paths) {
    for (const segment of path.split(sep)) {
      expect(segment).toMatch(VALID_NODE_SEGMENT_PATTERN);
    }
  }
}

function expectParentAndDescendantNodePaths(
  paths: readonly [string, string],
): void {
  const [parent, descendant] = paths;
  expect(descendant).not.toBe(parent);
  expect(isPathPrefix(parent, descendant)).toBe(true);
  expect(isPathPrefix(descendant, parent)).toBe(false);
}

function arbitraryGeneratedDispatchFiles(): fc.Arbitrary<GeneratedDispatchFiles> {
  return fc
    .constantFrom(...testingRegistry.languages)
    .chain((descriptor) =>
      TEST_DISPATCH_GENERATOR.nodePath().chain((nodePath) =>
        fc
          .tuple(
            TEST_DISPATCH_GENERATOR.testFileUnder(descriptor, nodePath),
            TEST_DISPATCH_GENERATOR.supportFileUnder(descriptor, nodePath),
          )
          .map(([testFile, supportFile]) => ({
            descriptor,
            nodePath,
            supportFile,
            testFile,
          }))
      )
    );
}

function expectDescriptorClassifiesGeneratedFiles(
  files: GeneratedDispatchFiles,
): void {
  const testsDirectory = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    files.nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    "",
  ].join(sep);
  expect(files.testFile.startsWith(testsDirectory)).toBe(true);
  expect(files.supportFile.startsWith(testsDirectory)).toBe(true);
  expect(
    files.descriptor.testFilePatterns.some((pattern) => matchesWildcardPattern(files.testFile, pattern)),
  ).toBe(true);
  expect(
    files.descriptor.testFilePatterns.every(
      (pattern) => !matchesWildcardPattern(files.supportFile, pattern),
    ),
  ).toBe(true);
  expect(files.descriptor.matchesTestFile(files.testFile)).toBe(true);
  expect(files.descriptor.matchesTestFile(files.supportFile)).toBe(false);
}

function matchesWildcardPattern(path: string, pattern: string): boolean {
  const filename = path.split(sep).at(-1);
  const wildcardIndex = pattern.indexOf(TEST_PATTERN_WILDCARD);
  if (filename === undefined || wildcardIndex < 0) return filename === pattern;
  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + TEST_PATTERN_WILDCARD.length);
  return (
    filename.startsWith(prefix)
    && filename.endsWith(suffix)
    && filename.length >= prefix.length + suffix.length
  );
}

export function registerTestGeneratorPropertyTests(): void {
  describe("dispatch generator node paths", () => {
    it("yields two distinct node paths where neither is a path-prefix of the other", () => {
      assertProperty(
        TEST_DISPATCH_GENERATOR.distinctNodePaths(),
        expectDistinctNonPrefixNodePaths,
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("yields a descendant node path below its generated parent", () => {
      assertProperty(
        TEST_DISPATCH_GENERATOR.nodeWithDescendant(),
        expectParentAndDescendantNodePaths,
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });

  describe("dispatch generator co-located files", () => {
    it("yields a descriptor-matching test file and a non-matching support file under a node", () => {
      assertProperty(
        arbitraryGeneratedDispatchFiles(),
        expectDescriptorClassifiesGeneratedFiles,
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export const testGeneratorPropertyCases = collectHarnessTestCases(
  registerTestGeneratorPropertyTests,
);
