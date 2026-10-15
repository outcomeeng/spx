import { describe, expect, it } from "vitest";

import { buildEvidenceResults } from "@/domains/test";
import { testingRegistry } from "@/test/registry";
import { EVIDENCE_CONTRACT_GENERATOR } from "@testing/generators/testing/evidence-contract";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

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
});
