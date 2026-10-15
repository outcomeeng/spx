import { describe, expect, it } from "vitest";

import { buildEvidenceResults, foldEvidenceVerdict, groupTestFiles } from "@/domains/test";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { arbitrarySourceFilePath, arbitrarySpecTreeTestFilePath } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

describe("testing registry membership", () => {
  it("enumerates each language's leaf runner descriptor", () => {
    expect(testingRegistry.languages).toContain(typescriptTestingLanguage);
    expect(testingRegistry.languages).toContain(pythonTestingLanguage);
  });
});

describe("read-path declaration", () => {
  it.each(testingRegistry.languages)(
    "$name declares read-path supply as a boolean and its results carry read paths exactly as declared",
    (descriptor) => {
      const firstReference = sampleGeneratedValue(arbitrarySpecTreeTestFilePath());
      const reportedPaths = [sampleGeneratedValue(arbitrarySourceFilePath())];
      const outcome = {
        runnerId: descriptor.name,
        testPaths: [firstReference],
        exitCode: 0,
        pathVerdicts: [{ testPath: firstReference, verdict: TEST_PATH_VERDICT.PASSED }],
      };

      const [result] = buildEvidenceResults(
        [outcome],
        testingRegistry.languages,
        new Map([[firstReference, reportedPaths]]),
      );

      expect([true, false]).toContain(descriptor.suppliesReadPaths);
      if (descriptor.suppliesReadPaths) {
        expect(result.readPaths).toEqual(reportedPaths);
      } else {
        expect(result.readPaths).toBeUndefined();
      }
    },
  );
});

describe("status fold", () => {
  it.each(
    Object.values(TEST_PATH_VERDICT).flatMap((first) =>
      Object.values(TEST_PATH_VERDICT).map((second) => [first, second] as const)
    ),
  )(
    "folds the verdicts %s and %s identically for every registered language",
    (firstVerdict, secondVerdict) => {
      const [firstReference, secondReference] = [
        sampleGeneratedValue(arbitrarySpecTreeTestFilePath()),
        sampleGeneratedValue(arbitrarySourceFilePath()),
      ];
      const foldedBy = (descriptor: TestingLanguageDescriptor) =>
        foldEvidenceVerdict(buildEvidenceResults([{
          runnerId: descriptor.name,
          testPaths: [firstReference, secondReference],
          exitCode: 0,
          pathVerdicts: [
            { testPath: firstReference, verdict: firstVerdict },
            { testPath: secondReference, verdict: secondVerdict },
          ],
        }], testingRegistry.languages));

      const folds = testingRegistry.languages.map(foldedBy);

      for (const fold of folds) {
        expect(fold).toBe(folds[0]);
      }
    },
  );
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
