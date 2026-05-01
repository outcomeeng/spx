/**
 * Scenario tests for structural validation.
 *
 * Test Level: 1 (Unit)
 * - Pure function over in-memory AuditVerdict; no file I/O
 *
 * Assertions covered from structural.md:
 * - S1: Missing <header> → "missing required element" defect
 * - S2: Gate status outside PASS|FAIL|SKIPPED → "invalid enum value" defect naming gate and bad value
 * - S3: Overall verdict outside APPROVED|REJECT → "invalid enum value" defect
 * - S4: Gate count attribute mismatch → "count mismatch" defect
 */

import { AuditVerdict } from "@/domains/audit/reader";
import { validateStructure } from "@/domains/audit/structural";
import { describe, expect, it } from "vitest";

const DEFECT_MISSING_ELEMENT = "missing required element";
const DEFECT_INVALID_ENUM = "invalid enum value";
const DEFECT_COUNT_MISMATCH = "count mismatch";

const VALID_HEADER = {
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

describe("validateStructure: scenarios", () => {
  it("GIVEN a verdict missing <header> WHEN structural validation runs THEN returns a 'missing required element' defect", () => {
    const verdict: AuditVerdict = { header: undefined, gates: [VALID_GATE] };

    const defects = validateStructure(verdict);

    expect(defects).toContainEqual(expect.stringContaining(DEFECT_MISSING_ELEMENT));
  });

  it("GIVEN a gate with a status outside PASS|FAIL|SKIPPED WHEN structural validation runs THEN returns an 'invalid enum value' defect naming the gate and bad value", () => {
    const badStatus = "REJECTED";
    const verdict: AuditVerdict = {
      header: VALID_HEADER,
      gates: [{ ...VALID_GATE, status: badStatus }],
    };

    const defects = validateStructure(verdict);

    const enumDefect = defects.find((d) => d.includes(DEFECT_INVALID_ENUM));
    expect(enumDefect).toBeDefined();
    expect(enumDefect).toContain(badStatus);
    expect(enumDefect).toContain(VALID_GATE.name);
  });

  it("GIVEN an overall verdict outside APPROVED|REJECT WHEN structural validation runs THEN returns an 'invalid enum value' defect", () => {
    const badVerdict = "MAYBE";
    const verdict: AuditVerdict = {
      header: { ...VALID_HEADER, verdict: badVerdict },
      gates: [VALID_GATE],
    };

    const defects = validateStructure(verdict);

    const enumDefect = defects.find((d) => d.includes(DEFECT_INVALID_ENUM));
    expect(enumDefect).toBeDefined();
    expect(enumDefect).toContain(badVerdict);
  });

  it("GIVEN a gate count attribute that does not match the number of findings WHEN structural validation runs THEN returns a 'count mismatch' defect", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER,
      gates: [{ ...VALID_GATE, count: "2", findings: [] }],
    };

    const defects = validateStructure(verdict);

    expect(defects).toContainEqual(expect.stringContaining(DEFECT_COUNT_MISMATCH));
  });

  it("GIVEN a fully valid verdict WHEN structural validation runs THEN returns an empty defect array", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER,
      gates: [VALID_GATE],
    };

    const defects = validateStructure(verdict);

    expect(defects).toHaveLength(0);
  });
});
