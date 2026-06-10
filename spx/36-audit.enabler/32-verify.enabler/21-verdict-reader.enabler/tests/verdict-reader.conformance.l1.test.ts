/**
 * Conformance tests for verdict reader.
 *
 * Test Level: 1 (Unit)
 * - Verifies the in-memory AuditVerdict type shape returned for valid XML content
 *
 * Assertions covered from verdict-reader.md:
 * - C1: Valid audit verdict XML returns AuditVerdict with header
 *       (spec_node, verdict, timestamp) and gates array (name, status, findings)
 */

import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE, AuditVerdict, parseAuditVerdictXml } from "@/domains/audit/reader";
import { AuditVerdictXmlFixture, renderAuditVerdictXml } from "@testing/harnesses/audit/harness";
import { describe, expect, it } from "vitest";

function createSinglePassGateFixture(): AuditVerdictXmlFixture {
  return {
    specNode: "spx/36-audit.enabler/21-verdict-reader.enabler",
    verdict: AUDIT_VERDICT_VALUE.APPROVED,
    timestamp: "2024-06-15_10-30-45",
    gates: [
      {
        name: "architecture",
        status: AUDIT_GATE_STATUS.PASS,
        findings: [],
      },
    ],
  };
}

function createFindingsFixture(): AuditVerdictXmlFixture {
  return {
    specNode: "spx/36-audit.enabler/21-verdict-reader.enabler",
    verdict: AUDIT_VERDICT_VALUE.REJECT,
    timestamp: "2024-06-15_10-30-45",
    gates: [
      {
        name: "architecture",
        status: AUDIT_GATE_STATUS.PASS,
        findings: [],
      },
      {
        name: "tests",
        status: AUDIT_GATE_STATUS.FAIL,
        findings: [
          {
            specFile: "spx/36-audit.enabler/verdict-reader.md",
            testFile: "tests/verdict-reader.conformance.l1.test.ts",
          },
        ],
      },
    ],
  };
}

describe("parseAuditVerdictXml: AuditVerdict conformance", () => {
  it("GIVEN valid verdict XML content WHEN the parser parses it THEN header contains spec_node, verdict, and timestamp as strings", () => {
    const fixture = createSinglePassGateFixture();
    const result: AuditVerdict = parseAuditVerdictXml(renderAuditVerdictXml(fixture), fixture.specNode);

    expect(result.header).toBeDefined();
    expect(result.header?.spec_node).toBe(fixture.specNode);
    expect(result.header?.verdict).toBe(fixture.verdict);
    expect(result.header?.timestamp).toBe(fixture.timestamp);
  });

  it("GIVEN valid verdict XML content with one gate WHEN the parser parses it THEN gates is an array with name, status, and findings", () => {
    const fixture = createSinglePassGateFixture();
    const result: AuditVerdict = parseAuditVerdictXml(renderAuditVerdictXml(fixture), fixture.specNode);

    expect(Array.isArray(result.gates)).toBe(true);
    expect(result.gates).toHaveLength(fixture.gates.length);
    expect(result.gates[0].name).toBe(fixture.gates[0].name);
    expect(result.gates[0].status).toBe(fixture.gates[0].status);
    expect(Array.isArray(result.gates[0].findings)).toBe(true);
  });

  it("GIVEN valid verdict XML content with a finding WHEN the parser parses it THEN findings array contains spec_file and test_file", () => {
    const fixture = createFindingsFixture();
    const result: AuditVerdict = parseAuditVerdictXml(renderAuditVerdictXml(fixture), fixture.specNode);

    expect(result.gates).toHaveLength(fixture.gates.length);
    const failGate = result.gates[1];
    const expectedFailGate = fixture.gates[1];
    const expectedFinding = expectedFailGate.findings[0];
    expect(failGate.name).toBe(expectedFailGate.name);
    expect(failGate.status).toBe(expectedFailGate.status);
    expect(failGate.findings).toHaveLength(expectedFailGate.findings.length);
    expect(failGate.findings[0].spec_file).toBe(expectedFinding.specFile);
    expect(failGate.findings[0].test_file).toBe(expectedFinding.testFile);
  });

  it("GIVEN valid verdict XML content with multiple gates WHEN the parser parses it THEN all gates are returned in order", () => {
    const fixture = createFindingsFixture();
    const result: AuditVerdict = parseAuditVerdictXml(renderAuditVerdictXml(fixture), fixture.specNode);

    expect(result.gates).toHaveLength(fixture.gates.length);
    expect(result.gates[0].name).toBe(fixture.gates[0].name);
    expect(result.gates[1].name).toBe(fixture.gates[1].name);
  });
});
