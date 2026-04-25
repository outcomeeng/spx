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

import type { AuditVerdict } from "@/audit/reader";
import { readVerdictFile } from "@/audit/reader";
import { createAuditHarness } from "@/audit/testing/harness";

const SPEC_NODE = "spx/36-audit.enabler/21-verdict-reader.enabler";
const TIMESTAMP = "2024-06-15_10-30-45";

const VALID_XML_SINGLE_PASS_GATE = `<audit_verdict>
  <header>
    <spec_node>${SPEC_NODE}</spec_node>
    <verdict>APPROVED</verdict>
    <timestamp>${TIMESTAMP}</timestamp>
  </header>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
  </gates>
</audit_verdict>`;

const VALID_XML_WITH_FINDINGS = `<audit_verdict>
  <header>
    <spec_node>${SPEC_NODE}</spec_node>
    <verdict>REJECT</verdict>
    <timestamp>${TIMESTAMP}</timestamp>
  </header>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
    <gate>
      <name>tests</name>
      <status>FAIL</status>
      <findings count="1">
        <finding>
          <spec_file>spx/36-audit.enabler/verdict-reader.md</spec_file>
          <test_file>tests/verdict-reader.conformance.l1.test.ts</test_file>
        </finding>
      </findings>
    </gate>
  </gates>
</audit_verdict>`;

describe("readVerdictFile: AuditVerdict conformance", () => {
  it("GIVEN a valid verdict XML WHEN the reader parses it THEN header contains spec_node, verdict, and timestamp as strings", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", VALID_XML_SINGLE_PASS_GATE);
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.header).toBeDefined();
      expect(result.header?.spec_node).toBe(SPEC_NODE);
      expect(result.header?.verdict).toBe("APPROVED");
      expect(result.header?.timestamp).toBe(TIMESTAMP);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with one gate WHEN the reader parses it THEN gates is an array with name, status, and findings", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", VALID_XML_SINGLE_PASS_GATE);
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(Array.isArray(result.gates)).toBe(true);
      expect(result.gates).toHaveLength(1);
      expect(result.gates[0].name).toBe("architecture");
      expect(result.gates[0].status).toBe("PASS");
      expect(Array.isArray(result.gates[0].findings)).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with a finding WHEN the reader parses it THEN findings array contains spec_file and test_file", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", VALID_XML_WITH_FINDINGS);
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.gates).toHaveLength(2);
      const failGate = result.gates[1];
      expect(failGate.name).toBe("tests");
      expect(failGate.status).toBe("FAIL");
      expect(failGate.findings).toHaveLength(1);
      expect(failGate.findings[0].spec_file).toBe(
        "spx/36-audit.enabler/verdict-reader.md",
      );
      expect(failGate.findings[0].test_file).toBe(
        "tests/verdict-reader.conformance.l1.test.ts",
      );
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN a valid verdict XML with multiple gates WHEN the reader parses it THEN all gates are returned in order", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", VALID_XML_WITH_FINDINGS);
      const result: AuditVerdict = await readVerdictFile(filePath);

      expect(result.gates).toHaveLength(2);
      expect(result.gates[0].name).toBe("architecture");
      expect(result.gates[1].name).toBe("tests");
    } finally {
      await harness.cleanup();
    }
  });
});
