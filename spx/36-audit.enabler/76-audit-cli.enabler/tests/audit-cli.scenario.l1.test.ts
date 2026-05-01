/**
 * Scenario tests for the audit CLI domain.
 *
 * Test Level: 1 (Unit)
 * - Tests Commander.js subcommand registration and runVerifyCommand output
 * - No process lifecycle; uses writeLine DI for output capture
 *
 * Assertions covered from audit-cli.md:
 * - S1: spx audit --help lists verify as an available subcommand
 * - S2: spx audit verify <file> with valid verdict outputs APPROVED or REJECT
 */

import { auditDomain, runVerifyCommand } from "@/domains/audit/cli";
import { createAuditHarness } from "@testing/harnesses/audit/harness";
import { Command } from "commander";
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

describe("auditDomain: subcommand registration (S1)", () => {
  it("GIVEN spx audit --help is run WHEN the command is invoked THEN verify is listed as an available subcommand", () => {
    const program = new Command().exitOverride();
    auditDomain.register(program);

    const auditCmd = program.commands.find((c) => c.name() === "audit");
    const verifyCmd = auditCmd?.commands.find((c) => c.name() === "verify");

    expect(auditCmd).toBeDefined();
    expect(verifyCmd).toBeDefined();
  });
});

describe("runVerifyCommand: output routing (S2)", () => {
  it("GIVEN spx audit verify is invoked with a valid verdict XML WHEN the audit domain routes the call THEN output contains APPROVED or REJECT", async () => {
    const harness = await createAuditHarness();
    try {
      const filePath = await harness.writeVerdict("test/node", VALID_XML);
      const lines: string[] = [];

      const exitCode = await runVerifyCommand(filePath, harness.projectRoot, (l) => lines.push(l));

      expect(exitCode).toBe(0);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^(APPROVED|REJECT)$/);
    } finally {
      await harness.cleanup();
    }
  });
});
