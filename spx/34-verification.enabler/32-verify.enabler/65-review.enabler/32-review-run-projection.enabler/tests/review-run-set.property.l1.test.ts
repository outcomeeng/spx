import { describe, expect, it } from "vitest";

import { reviewRunSetFindingIdentity, reviewRunSetScopeUnitKey } from "@/domains/verify/review-run-set";
import { projectRunSet } from "@/domains/verify/run-set";
import { VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("review run-set projection properties", () => {
  it("projects review run evidence into active, resolved, reopened, and coverage-gap groups", () => {
    assertProperty(
      VERIFY_TEST_GENERATOR.reviewRunSetScenario(),
      (scenario) => {
        const projection = projectRunSet({
          runs: scenario.runs,
          selector: scenario.selector,
          findingIdentity: reviewRunSetFindingIdentity,
          scopeUnitKey: reviewRunSetScopeUnitKey,
        });
        expect(projection.activeFindings).toEqual(scenario.expectedActive);
        expect(projection.resolvedFindings).toEqual(scenario.expectedResolved);
        expect(projection.reopenedFindings).toEqual(scenario.expectedReopened);
        expect(projection.coverageGaps).toEqual(scenario.expectedCoverageGaps);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
