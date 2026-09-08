import { describe, expect, it } from "vitest";

import {
  AUDIT_CLASS,
  AUDIT_KIND,
  auditPriorContextSelectorForScopeUnit,
  filterAuditScopeUnitsForPriorContext,
} from "@/domains/verify/verify";
import { arbitraryAuditPriorContextScenario, arbitraryChangeAuditScopeUnit } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit prior-context selectors", () => {
  it("preserves Change classification and excludes other audit kinds from prior context", () => {
    assertProperty(arbitraryChangeAuditScopeUnit(), (unit) => {
      const selector = auditPriorContextSelectorForScopeUnit(unit);
      expect(selector).toEqual({
        auditClass: AUDIT_CLASS.COORDINATION,
        auditKind: AUDIT_KIND.CHANGE,
        expectedProducer: unit.expectedProducer,
        subjectPath: unit.subject,
        changedFilePartition: unit.priorContext.changedFilePartition,
        concernPartition: unit.priorContext.concernPartition,
        languagePartition: unit.priorContext.languagePartition,
        producerIdentity: unit.recordedByRunDriver,
      });
      expect(filterAuditScopeUnitsForPriorContext([
        { ...unit, auditClass: AUDIT_CLASS.IMPLEMENTATION, auditKind: AUDIT_KIND.CODE },
        unit,
      ], selector)).toEqual([unit]);
    }, { level: PROPERTY_LEVEL.L1 });
  });
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
