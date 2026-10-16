import { describe, expect, it } from "vitest";

import { buildEvidenceResults } from "@/domains/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { testingRegistry } from "@/test/registry";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { EVIDENCE_CONTRACT_GENERATOR } from "@testing/generators/testing/evidence-contract";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withRecordedTestRuns } from "@testing/harnesses/testing/status-consumers";
import { commonRecordedVerdict, everyRecordedVerdictPassed } from "@testing/harnesses/testing/status-oracle";

describe("language-neutral evidence contract", () => {
  it("maps each recorded path verdict to one result carrying its evidence reference and verdict", () => {
    assertProperty(EVIDENCE_CONTRACT_GENERATOR.scenario(), ({ runs, readPathsByReference }) => {
      const recorded = runs.flatMap((run) => run.outcome.pathVerdicts);

      const results = buildEvidenceResults(
        runs.map((run) => run.outcome),
        testingRegistry.languages,
        readPathsByReference,
      );

      expect(results.map((result) => result.evidenceReference)).toEqual(recorded.map((entry) => entry.testPath));
      expect(results.map((result) => result.verdict)).toEqual(recorded.map((entry) => entry.verdict));
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("carries the paths a result read exactly when the owning adapter supplies them and reports some", () => {
    assertProperty(EVIDENCE_CONTRACT_GENERATOR.scenario(), ({ runs, readPathsByReference }) => {
      const owners = runs.flatMap((run) => run.outcome.pathVerdicts.map(() => run.language));

      const results = buildEvidenceResults(
        runs.map((run) => run.outcome),
        testingRegistry.languages,
        readPathsByReference,
      );

      results.forEach((result, index) => {
        const reported = readPathsByReference.get(result.evidenceReference);
        if (owners[index].suppliesReadPaths && reported !== undefined) {
          expect(result.readPaths).toEqual(reported);
        } else {
          expect(result.readPaths).toBeUndefined();
        }
      });
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it(
    "reaches the status path: the production outcome resolver reports each reference the recorded verdict when its covering runners agree, and passed only when every recorded verdict is passed",
    async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const evidencePaths = testingRegistry.languages.flatMap((descriptor) =>
        sampleDispatchValue(TEST_DISPATCH_GENERATOR.everyPatternTestFilesUnder(descriptor, nodePath))
      );

      await withRecordedTestRuns(evidencePaths, async (runs) => {
        await assertProperty(
          EVIDENCE_CONTRACT_GENERATOR.recordedVerdictsOver(evidencePaths),
          async (recordedByReference) => {
            await runs.record(
              recordedByReference.flatMap((recorded, index) =>
                recorded.map(({ language, verdict, exitCode }) => ({
                  runnerId: language.name,
                  testPaths: [evidencePaths[index]],
                  exitCode,
                  pathVerdicts: [{ testPath: evidencePaths[index], verdict }],
                }))
              ),
            );

            const outcomes = await runs.resolverOverRecordedRuns()(nodePath, evidencePaths);

            recordedByReference.forEach((recorded, index) => {
              const verdicts = recorded.map((entry) => entry.verdict);
              const outcome = outcomes[evidencePaths[index]];
              expect(outcome).toBeDefined();
              expect(outcome === NODE_STATUS_EVIDENCE_OUTCOME.PASSED).toBe(everyRecordedVerdictPassed(verdicts));
              if (commonRecordedVerdict(verdicts) !== undefined) {
                expect(outcome).toBe(commonRecordedVerdict(verdicts));
              }
            });
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
        );
      });
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});
