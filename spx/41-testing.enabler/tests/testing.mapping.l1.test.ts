import { describe, expect, it } from "vitest";

import { groupTestFiles } from "@/domains/testing";
import { pythonTestingLanguage } from "@/testing/languages/python";
import type { TestingLanguageDescriptor } from "@/testing/languages/types";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { testingRegistry } from "@/testing/registry";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

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
