import { describe, expect, it } from "vitest";

import { auditPriorContextSelectorForScopeUnit, filterAuditScopeUnitsForPriorContext } from "@/domains/verify/verify";
import { arbitraryAuditPriorContextScenario } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit prior-context selectors", () => {
  it("filters prior context by every audit selector field", async () => {
    assertProperty(
      arbitraryAuditPriorContextScenario(),
      (scenario) => {
        const selector = auditPriorContextSelectorForScopeUnit(scenario.current);
        expect(selector).toEqual({
          auditClass: scenario.current.auditClass,
          auditKind: scenario.current.auditKind,
          expectedProducer: scenario.current.expectedProducer,
          subjectPath: scenario.current.subject,
          changedFilePartition: scenario.current.priorContext.changedFilePartition,
          concernPartition: scenario.current.priorContext.concernPartition,
          languagePartition: scenario.current.priorContext.languagePartition,
          producerIdentity: scenario.current.recordedByRunDriver,
        });
        expect(
          filterAuditScopeUnitsForPriorContext(
            [...scenario.mismatches, scenario.currentWithoutProvenance, scenario.current],
            selector,
          ),
        ).toEqual([scenario.currentWithoutProvenance, scenario.current]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
