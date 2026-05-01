/**
 * Scenario tests for the audit enabler top-level assertions.
 *
 * Test Level: 1 (Unit)
 * - Uses AuditHarness and runVerifyCommand with writeLine DI
 *
 * Assertions covered from audit.md:
 * - S1: spx audit verify with valid verdict → exits 0, prints APPROVED or REJECT
 * - S2: spx audit verify with defective verdict → exits 1, prints stage-prefixed defects
 */

import { runVerifyCommand } from "@/domains/audit/cli";
import { createAuditHarness } from "@testing/harnesses/audit/harness";
import { describe, expect, it } from "vitest";

const VALID_XML = `<audit_verdict>
  <header>
    <spec_node>spx/36-audit.enabler</spec_node>
    <verdict>APPROVED</verdict>
    <timestamp>2024-01-01_00-00-00</timestamp>
  </header>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
  </gates>
</audit_verdict>`;

const DEFECTIVE_XML = `<audit_verdict>
  <gates>
    <gate>
      <name>architecture</name>
      <status>PASS</status>
      <findings count="0"/>
    </gate>
  </gates>
</audit_verdict>`;

const STAGE_PREFIX_PATTERN = /^(reader|structural|semantic|paths): /;

describe("spx audit verify: top-level scenarios", () => {
  it("GIVEN spx audit verify is run with a valid audit verdict XML WHEN all four verification stages pass THEN the command exits 0 and prints APPROVED or REJECT to stdout", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("spx/36-audit.enabler", VALID_XML);
      const lines: string[] = [];

      const exitCode = await runVerifyCommand(filePath, harness.projectRoot, (l) => lines.push(l));

      expect(exitCode).toBe(0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^(APPROVED|REJECT)$/);
    } finally {
      await harness.cleanup();
    }
  });

  it("GIVEN spx audit verify is run with a defective audit verdict XML WHEN one or more stages fail THEN the command exits 1 and prints each defect preceded by its stage name", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("spx/36-audit.enabler", DEFECTIVE_XML);
      const lines: string[] = [];

      const exitCode = await runVerifyCommand(filePath, harness.projectRoot, (l) => lines.push(l));

      expect(exitCode).toBe(1);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(STAGE_PREFIX_PATTERN);
      }
    } finally {
      await harness.cleanup();
    }
  });
});
