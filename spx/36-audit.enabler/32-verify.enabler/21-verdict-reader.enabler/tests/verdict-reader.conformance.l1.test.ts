/**
 * Conformance tests for verdict reader.
 *
 * Test Level: 1 (Unit)
 * - Verifies the in-memory AuditVerdict type shape returned for valid XML
 * - Uses AuditHarness for temp file creation
 *
 * Assertions covered from verdict-reader.md:
 * - C1: Valid audit verdict XML returns AuditVerdict with header
 *       (spec_node, verdict, timestamp) and gates array (name, status, findings)
 */

import { describe, expect, it } from "vitest";

import type { AuditGateStatus, AuditVerdict, AuditVerdictValue } from "@/audit/reader";
import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE, readVerdictFile } from "@/audit/reader";
import { createAuditHarness } from "@/audit/testing/harness";

import { AUDIT_XML_TEST_TOKENS } from "@root/spx/36-audit.enabler/32-verify.enabler/tests/support";

interface FindingFixture {
  readonly specFile: string;
  readonly testFile: string;
}

interface GateFixture {
  readonly name: string;
  readonly status: AuditGateStatus;
  readonly findings: readonly FindingFixture[];
}

interface VerdictFixture {
  readonly specNode: string;
  readonly verdict: AuditVerdictValue;
  readonly timestamp: string;
  readonly gates: readonly GateFixture[];
}

function createSinglePassGateFixture(): VerdictFixture {
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

function createFindingsFixture(): VerdictFixture {
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

function renderVerdictXml(fixture: VerdictFixture): string {
  const gatesXml = fixture.gates.map(renderGateXml).join("\n");

  return `<audit_verdict>
  <header>
    <spec_node>${fixture.specNode}</spec_node>
    <verdict>${fixture.verdict}</verdict>
    <timestamp>${fixture.timestamp}</timestamp>
  </header>
  <gates>
${gatesXml}${AUDIT_XML_TEST_TOKENS.VERDICT_GATES_CLOSE}`;
}

function renderGateXml(gate: GateFixture): string {
  const findingsXml = gate.findings.map(renderFindingXml).join("\n");
  const findingsElement = gate.findings.length === 0
    ? `${AUDIT_XML_TEST_TOKENS.FINDINGS_COUNT_OPEN}${gate.findings.length}"/>`
    : `${AUDIT_XML_TEST_TOKENS.FINDINGS_COUNT_OPEN}${gate.findings.length}">
${findingsXml}
      </findings>`;

  return `    <gate>
      <name>${gate.name}</name>
      <status>${gate.status}</status>
      ${findingsElement}
    </gate>`;
}

function renderFindingXml(finding: FindingFixture): string {
  return `        <finding>
          <spec_file>${finding.specFile}</spec_file>
          <test_file>${finding.testFile}</test_file>
        </finding>`;
}

describe("readVerdictFile: AuditVerdict conformance", () => {
  it("GIVEN a valid verdict XML WHEN the reader parses it THEN header contains spec_node, verdict, and timestamp as strings", async () => {
    const harness = await createAuditHarness();
    try {
      const fixture = createSinglePassGateFixture();
      const filePath = await harness.writeVerdict("test/node", renderVerdictXml(fixture));
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.header).toBeDefined();
      expect(result.header?.spec_node).toBe(fixture.specNode);
      expect(result.header?.verdict).toBe(fixture.verdict);
      expect(result.header?.timestamp).toBe(fixture.timestamp);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with one gate WHEN the reader parses it THEN gates is an array with name, status, and findings", async () => {
    const harness = await createAuditHarness();
    try {
      const fixture = createSinglePassGateFixture();
      const filePath = await harness.writeVerdict("test/node", renderVerdictXml(fixture));
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(Array.isArray(result.gates)).toBe(true);
      expect(result.gates).toHaveLength(fixture.gates.length);
      expect(result.gates[0].name).toBe(fixture.gates[0].name);
      expect(result.gates[0].status).toBe(fixture.gates[0].status);
      expect(Array.isArray(result.gates[0].findings)).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with a finding WHEN the reader parses it THEN findings array contains spec_file and test_file", async () => {
    const harness = await createAuditHarness();
    try {
      const fixture = createFindingsFixture();
      const filePath = await harness.writeVerdict("test/node", renderVerdictXml(fixture));
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.gates).toHaveLength(fixture.gates.length);
      const failGate = result.gates[1];
      const expectedFailGate = fixture.gates[1];
      const expectedFinding = expectedFailGate.findings[0];
      expect(failGate.name).toBe(expectedFailGate.name);
      expect(failGate.status).toBe(expectedFailGate.status);
      expect(failGate.findings).toHaveLength(expectedFailGate.findings.length);
      expect(failGate.findings[0].spec_file).toBe(expectedFinding.specFile);
      expect(failGate.findings[0].test_file).toBe(expectedFinding.testFile);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with multiple gates WHEN the reader parses it THEN all gates are returned in order", async () => {
    const harness = await createAuditHarness();
    try {
      const fixture = createFindingsFixture();
      const filePath = await harness.writeVerdict("test/node", renderVerdictXml(fixture));
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.gates).toHaveLength(fixture.gates.length);
      expect(result.gates[0].name).toBe(fixture.gates[0].name);
      expect(result.gates[1].name).toBe(fixture.gates[1].name);
    } finally {
      await harness.cleanup();
    }
  });
});
