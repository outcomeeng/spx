import { describe, expect, it } from "vitest";

import { groupTestFiles } from "@/domains/test";
import { testingRegistry } from "@/test/registry";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

describe("testing registry membership", () => {
  it.each(testingRegistry.languages)(
    "$name provides a usable runner adapter whose every declared pattern routes its own test files",
    (descriptor) => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testFiles = sampleDispatchValue(TEST_DISPATCH_GENERATOR.everyPatternTestFilesUnder(descriptor, nodePath));

      expect(descriptor.name.length).toBeGreaterThan(0);
      expect(descriptor.testFilePatterns.length).toBeGreaterThan(0);
      expect(descriptor.detect).toBeInstanceOf(Function);
      expect(descriptor.runTests).toBeInstanceOf(Function);
      expect(testFiles).toHaveLength(descriptor.testFilePatterns.length);
      for (const testFile of testFiles) {
        expect(descriptor.matchesTestFile(testFile)).toBe(true);
      }
      expect(testingRegistry.languages.filter((candidate) => candidate.name === descriptor.name)).toHaveLength(1);
    },
  );
});

describe("extension-based dispatch routing", () => {
  it.each(testingRegistry.languages)(
    "routes a test file of every pattern $name declares into that language's group",
    (descriptor) => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testFiles = sampleDispatchValue(TEST_DISPATCH_GENERATOR.everyPatternTestFilesUnder(descriptor, nodePath));

      const grouping = groupTestFiles(testFiles, testingRegistry.languages);

      const group = grouping.groups.find((candidate) => candidate.language === descriptor);
      for (const testFile of testFiles) {
        expect(group?.testPaths).toContain(testFile);
        expect(grouping.unmatched).not.toContain(testFile);
      }
    },
  );
});
