import { describe, expect, it } from "vitest";

import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import { validateAuditScope } from "@/domains/verify/verify";
import {
  arbitraryAuditScopePayload,
  invalidCoveredCoverageGapAuditScopePayloads,
} from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope payload conformance", () => {
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
