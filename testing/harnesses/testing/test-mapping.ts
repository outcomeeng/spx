import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

import { groupTestFiles } from "@/domains/test";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

export function registerTestMappingTests(): void {
  describe("testing registry membership", () => {
    it("enumerates each language's leaf runner descriptor", () => {
      expect(testingRegistry.languages).toContain(typescriptTestingLanguage);
      expect(testingRegistry.languages).toContain(pythonTestingLanguage);
    });
  });

  describe("extension-based dispatch routing", () => {
    it.each<TestingLanguageDescriptor>([typescriptTestingLanguage, pythonTestingLanguage])(
      "routes a $name test file into that language's group",
      (descriptor) => {
        const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
        const testFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(descriptor, nodePath));

        const grouping = groupTestFiles([testFile], testingRegistry.languages);

        const group = grouping.groups.find((candidate) => candidate.language === descriptor);
        expect(group?.testPaths).toContain(testFile);
        expect(grouping.unmatched).not.toContain(testFile);
      },
    );
  });
}

export const testMappingCases = collectHarnessTestCases(registerTestMappingTests);
