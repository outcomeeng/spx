import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import { AUDIT_CLASS, AUDIT_COVERAGE_STATUS, AUDIT_KIND, validateAuditScope } from "@/domains/verify/verify";
import {
  arbitraryAuditScopePayload,
  arbitraryChangeAuditScopeUnit,
  auditScopePayload,
  invalidCoveredCoverageGapAuditScopePayloads,
} from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope payload conformance", () => {
  it("accepts Change units and rejects every incompatible class and executed kind", () => {
    assertProperty(arbitraryChangeAuditScopeUnit(), (unit) => {
      expect(validateAuditScope(auditScopePayload(unit))).toEqual({ ok: true, value: unit });
      for (const auditClass of Object.values(AUDIT_CLASS)) {
        if (auditClass === AUDIT_CLASS.COORDINATION) continue;
        const result = validateAuditScope(auditScopePayload({ ...unit, auditClass }));
        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.reason).toContain(EVIDENCE_REQUIREMENT.AUDIT_KIND_MATCHES_CLASS);
      }
      for (const auditKind of Object.values(AUDIT_KIND)) {
        if (auditKind === AUDIT_KIND.CHANGE || auditKind === AUDIT_KIND.COVERAGE_GAP) continue;
        const result = validateAuditScope(auditScopePayload({ ...unit, auditKind }));
        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.reason).toContain(EVIDENCE_REQUIREMENT.AUDIT_KIND_MATCHES_CLASS);
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("accepts coordination coverage gaps only with uncovered statuses", () => {
    assertProperty(arbitraryChangeAuditScopeUnit(), ({ producerProvenance: _provenance, ...unit }) => {
      for (const coverageStatus of Object.values(AUDIT_COVERAGE_STATUS)) {
        const payload = { ...unit, auditKind: AUDIT_KIND.COVERAGE_GAP, coverageStatus };
        const result = validateAuditScope(auditScopePayload(payload));
        if (
          coverageStatus === AUDIT_COVERAGE_STATUS.AUDITED || coverageStatus === AUDIT_COVERAGE_STATUS.NOT_APPLICABLE
        ) {
          expect(result.ok).toBe(false);
          expect(result.ok ? "" : result.reason).toContain(EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_IS_UNCOVERED);
        } else {
          expect(result).toEqual({ ok: true, value: payload });
        }
      }
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("accepts nestable audit units with producer identity, provenance, coverage, and prior-context partitions", () => {
    assertProperty(
      arbitraryAuditScopePayload(),
      (payload) => {
        expect(validateAuditScope(payload)).toEqual({ ok: true, value: payload });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects coverage-gap units carrying covered statuses, naming the requirement they miss", () => {
    for (const payload of invalidCoveredCoverageGapAuditScopePayloads()) {
      const result = validateAuditScope(payload);
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.reason).toContain(EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_IS_UNCOVERED);
    }
  });
});
