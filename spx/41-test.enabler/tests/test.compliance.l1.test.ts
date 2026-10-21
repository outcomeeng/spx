import { describe, expect, it } from "vitest";

import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { EVIDENCE_CONTRACT_GENERATOR } from "@testing/generators/testing/evidence-contract";
import { withRecordedReadPaths, withRecordedTestRuns } from "@testing/harnesses/testing/status-consumers";
import { commonRecordedVerdict, everyRecordedVerdictPassed } from "@testing/harnesses/testing/status-oracle";

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
