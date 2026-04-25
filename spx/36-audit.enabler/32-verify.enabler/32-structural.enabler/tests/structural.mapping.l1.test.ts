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

import type { AuditVerdict } from "@/audit/reader";
import { validateStructure } from "@/audit/structural";

const DEFECT_MISSING_ELEMENT = "missing required element";
const DEFECT_INVALID_ENUM = "invalid enum value";

const FULL_HEADER = {
  spec_node: "spx/36-audit.enabler",
  verdict: "APPROVED",
  timestamp: "2024-01-01_00-00-00",
};

const VALID_GATE = {
  name: "architecture",
  status: "PASS",
  count: "0",
  findings: [] as const,
};

describe("validateStructure: required element mapping (M1)", () => {
  it("GIVEN header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: undefined, gates: [VALID_GATE] };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(DEFECT_MISSING_ELEMENT),
    );
  });

  it("GIVEN spec_node inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...FULL_HEADER, spec_node: undefined },
      gates: [VALID_GATE],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(DEFECT_MISSING_ELEMENT),
    );
  });

  it("GIVEN verdict inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...FULL_HEADER, verdict: undefined },
      gates: [VALID_GATE],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(DEFECT_MISSING_ELEMENT),
    );
  });

  it("GIVEN timestamp inside header is absent WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = {
      header: { ...FULL_HEADER, timestamp: undefined },
      gates: [VALID_GATE],
    };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(DEFECT_MISSING_ELEMENT),
    );
  });

  it("GIVEN gates array is empty WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: FULL_HEADER, gates: [] };
    expect(validateStructure(verdict)).toContainEqual(
      expect.stringContaining(DEFECT_MISSING_ELEMENT),
    );
  });

  it("GIVEN all required elements are present WHEN structural validation runs THEN returns no 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: FULL_HEADER, gates: [VALID_GATE] };
    expect(
      validateStructure(verdict).some((d) => d.includes(DEFECT_MISSING_ELEMENT)),
    ).toBe(false);
  });
});

describe("validateStructure: gate status mapping (M2)", () => {
  const VALID_STATUSES = ["PASS", "FAIL", "SKIPPED"] as const;
  const INVALID_STATUSES = ["REJECTED", "PASS_WITH_NOTES", "skipped"] as const;

  it.each(VALID_STATUSES)(
    "GIVEN gate status '%s' WHEN structural validation runs THEN no enum defect is reported",
    (status) => {
      const verdict: AuditVerdict = {
        header: FULL_HEADER,
        gates: [{ ...VALID_GATE, status }],
      };
      expect(
        validateStructure(verdict).some((d) => d.includes(DEFECT_INVALID_ENUM)),
      ).toBe(false);
    },
  );

  it.each(INVALID_STATUSES)(
    "GIVEN gate status '%s' WHEN structural validation runs THEN an 'invalid enum value' defect is reported",
    (status) => {
      const verdict: AuditVerdict = {
        header: FULL_HEADER,
        gates: [{ ...VALID_GATE, status }],
      };
      expect(validateStructure(verdict)).toContainEqual(
        expect.stringContaining(DEFECT_INVALID_ENUM),
      );
    },
  );
});
