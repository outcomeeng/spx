import { describe, expect, it } from "vitest";

import { auditPriorContextSelectorForScopeUnit, filterAuditScopeUnitsForPriorContext } from "@/domains/verify/verify";
import { arbitraryAuditPriorContextScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit prior-context selectors", () => {
  it("filters prior context by every audit selector field", () => {
    expect(auditPriorContextSelectorForScopeUnit(
      sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current,
    )).toEqual({
      auditClass: sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.auditClass,
      auditKind: sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.auditKind,
      expectedProducer: sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.expectedProducer,
      subjectPath: sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.subject,
      changedFilePartition:
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.priorContext.changedFilePartition,
      concernPartition:
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.priorContext.concernPartition,
      languagePartition:
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.priorContext.languagePartition,
      producerIdentity: sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current.recordedByRunDriver,
    });
    expect(filterAuditScopeUnitsForPriorContext(
      [
        ...sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).mismatches,
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).currentWithoutProvenance,
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current,
      ],
      auditPriorContextSelectorForScopeUnit(
        sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current,
      ),
    )).toEqual([
      sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).currentWithoutProvenance,
      sampleVerifyTestValue(arbitraryAuditPriorContextScenario()).current,
    ]);
  });
});
