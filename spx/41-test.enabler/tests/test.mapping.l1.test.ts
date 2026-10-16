import { describe, expect, it } from "vitest";

import { groupTestFiles } from "@/domains/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { EVIDENCE_CONTRACT_GENERATOR } from "@testing/generators/testing/evidence-contract";
import { withRecordedReadPaths, withRecordedTestRuns } from "@testing/harnesses/testing/status-consumers";
import { commonRecordedVerdict, everyRecordedVerdictPassed } from "@testing/harnesses/testing/status-oracle";

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

describe("read-path declaration", () => {
  it.each(testingRegistry.languages)(
    "$name declares read-path supply as a boolean and the production status path reads paths for its evidence exactly as declared",
    async (descriptor) => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const evidencePaths = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.everyPatternTestFilesUnder(descriptor, nodePath),
      );
      const outcome = sampleGeneratedValue(EVIDENCE_CONTRACT_GENERATOR.verdict());

      await withRecordedReadPaths(evidencePaths, async ({ resolveReadPaths, reportedReadPaths }) => {
        expect([true, false]).toContain(descriptor.suppliesReadPaths);
        for (const evidencePath of evidencePaths) {
          const readPaths = await resolveReadPaths(nodePath, evidencePath, outcome);

          if (descriptor.suppliesReadPaths) {
            expect(readPaths).toEqual(reportedReadPaths);
          } else {
            expect(readPaths).toBeUndefined();
          }
        }
      });
    },
  );
});

describe("status fold", () => {
  it.each(
    Object.values(TEST_PATH_VERDICT).flatMap((first) =>
      Object.values(TEST_PATH_VERDICT).map((second) => [first, second] as const)
    ),
  )(
    "the production outcome resolver folds the verdicts %s and %s of two runners alike for every registered language",
    async (firstVerdict, secondVerdict) => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const covered = testingRegistry.languages.map((descriptor) => ({
        descriptor,
        testPath: sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(descriptor, nodePath)),
      }));
      const verdicts = [firstVerdict, secondVerdict];

      await withRecordedTestRuns(covered.map(({ testPath }) => testPath), async (runs) => {
        await runs.record(
          covered.flatMap(({ descriptor, testPath }) =>
            verdicts.map((verdict) => ({
              runnerId: descriptor.name,
              testPaths: [testPath],
              exitCode: sampleGeneratedValue(EVIDENCE_CONTRACT_GENERATOR.exitCode()),
              pathVerdicts: [{ testPath, verdict }],
            }))
          ),
        );

        const outcomes = await runs.resolverOverRecordedRuns()(nodePath, covered.map(({ testPath }) => testPath));

        const resolved = covered.map(({ testPath }) => outcomes[testPath]);
        for (const outcome of resolved) {
          expect(outcome).toBe(resolved[0]);
          expect(outcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED).toBe(everyRecordedVerdictPassed(verdicts));
          if (commonRecordedVerdict(verdicts) !== undefined) {
            expect(outcome).toBe(commonRecordedVerdict(verdicts));
          }
        }
      });
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
