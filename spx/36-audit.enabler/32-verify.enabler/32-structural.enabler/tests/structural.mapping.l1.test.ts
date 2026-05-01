/**
 * Mapping tests for structural validation.
 *
 * Test Level: 1 (Unit)
 * - Pure function over in-memory AuditVerdict; no file I/O
 *
 * Assertions covered from structural.md:
 * - M1: Each of the 6 required elements maps to a named check; absence → "missing required element"
 * - M2: Each allowed gate status (PASS, FAIL, SKIPPED) maps to valid; any other value maps to defect
 */

import { describe, expect, it } from "vitest";

import {
  AUDIT_GATE_STATUS,
  AUDIT_VERDICT_VALUE,
  type AuditGate,
  type AuditVerdict,
  type AuditVerdictHeader,
} from "@/audit/reader";
import { STRUCTURAL_DEFECT_TEXT, validateStructure } from "@/audit/structural";

function createFullHeader(): AuditVerdictHeader {
  return {
    spec_node: "spx/36-audit.enabler",
    verdict: AUDIT_VERDICT_VALUE.APPROVED,
    timestamp: "2024-01-01_00-00-00",
  };
}

function createValidGate(overrides: Partial<AuditGate> = {}): AuditGate {
  return {
    name: "architecture",
    status: AUDIT_GATE_STATUS.PASS,
    count: "0",
    findings: [],
    ...overrides,
  };
}

describe("validateStructure: required element mapping (M1)", () => {
  it("GIVEN header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: undefined, gates: [createValidGate()] };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT),
    );
  });

  it("GIVEN spec_node inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...createFullHeader(), spec_node: undefined },
      gates: [createValidGate()],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT),
    );
  });

  it("GIVEN verdict inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...createFullHeader(), verdict: undefined },
      gates: [createValidGate()],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT),
    );
  });

  it("GIVEN timestamp inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...createFullHeader(), timestamp: undefined },
      gates: [createValidGate()],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT),
    );
  });

  it("GIVEN gates array is empty WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: createFullHeader(), gates: [] };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT),
    );
  });

  it("GIVEN all required elements are present WHEN structural validation runs THEN returns no 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: createFullHeader(), gates: [createValidGate()] };
    expect(
      validateStructure(verdict).some((d) => d.includes(STRUCTURAL_DEFECT_TEXT.MISSING_REQUIRED_ELEMENT)),
    ).toBe(false);
  });
});

describe("validateStructure: gate status mapping (M2)", () => {
  it.each(Object.values(AUDIT_GATE_STATUS))(
    "GIVEN gate status '%s' WHEN structural validation runs THEN no enum defect is reported",
    (status) => {
      const verdict: AuditVerdict = {
        header: createFullHeader(),
        gates: [createValidGate({ status })],
      };
      expect(
        validateStructure(verdict).some((d) => d.includes(STRUCTURAL_DEFECT_TEXT.INVALID_ENUM_VALUE)),
      ).toBe(false);
    },
  );

  it.each(["REJECTED", "PASS_WITH_NOTES", "skipped"] as const)(
    "GIVEN gate status '%s' WHEN structural validation runs THEN an 'invalid enum value' defect is reported",
    (status) => {
      const verdict: AuditVerdict = {
        header: createFullHeader(),
        gates: [createValidGate({ status })],
      };
      expect(validateStructure(verdict)).toContainEqual(
        expect.stringContaining(STRUCTURAL_DEFECT_TEXT.INVALID_ENUM_VALUE),
      );
    },
  );
});
