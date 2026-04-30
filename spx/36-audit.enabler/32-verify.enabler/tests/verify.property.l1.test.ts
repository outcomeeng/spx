/**
 * Property tests for the verify pipeline.
 *
 * Test Level: 1 (Unit)
 * - Uses AuditHarness and fast-check for property-based generation
 *
 * Assertions covered from verify.md:
 * - P1: The pipeline is deterministic: same input always produces same stage results and exit code
 */

import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuditHarness } from "@/audit/testing/harness";
import { createAuditHarness } from "@/audit/testing/harness";
import { runVerifyPipeline } from "@/audit/verify";

import { AUDIT_XML_TEST_TOKENS } from "./support";

const VALID_STATUSES = ["PASS", "FAIL", "SKIPPED"] as const;
const VALID_VERDICTS = ["APPROVED", "REJECT"] as const;

function buildGateXml(name: string, status: string, findings: number): string {
  const findingElements = Array.from(
    { length: findings },
    (_, i) => `<finding><spec_file>spec${i}.md</spec_file><test_file>test${i}.ts</test_file></finding>`,
  ).join("");
  const skippedReason = status === "SKIPPED" ? "<skipped_reason>Not applicable</skipped_reason>" : "";
  return `<gate><name>${name}</name><status>${status}</status>${skippedReason}${AUDIT_XML_TEST_TOKENS.FINDINGS_COUNT_OPEN}${findings}">${findingElements}</findings></gate>`;
}

function buildVerdictXml(verdict: string, gates: string[]): string {
  return `<audit_verdict>
  <header>
    <spec_node>spx/36-audit.enabler</spec_node>
    <verdict>${verdict}</verdict>
    <timestamp>2024-01-01_00-00-00</timestamp>
  </header>
  <gates>
    ${gates.join("\n    ")}${AUDIT_XML_TEST_TOKENS.VERDICT_GATES_CLOSE}`;
}

describe("runVerifyPipeline: determinism property (P1)", () => {
  let harness: AuditHarness;

  beforeEach(async () => {
    harness = await createAuditHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN any syntactically valid audit verdict XML WHEN the pipeline runs twice with the same input THEN both runs produce identical lines and exit code", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          verdict: fc.constantFrom(...VALID_VERDICTS),
          gates: fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              status: fc.constantFrom(...VALID_STATUSES),
              findings: fc.integer({ min: 0, max: 3 }),
            }),
            { minLength: 1, maxLength: 3 },
          ),
        }),
        async ({ verdict, gates }) => {
          const gateXmls = gates.map((g, i) => buildGateXml(g.name || `gate${i}`, g.status, g.findings));
          const xml = buildVerdictXml(verdict, gateXmls);

          const filePath = await harness.writeVerdict(`prop-test/${verdict}`, xml);

          const result1 = await runVerifyPipeline(filePath, harness.projectRoot);
          const result2 = await runVerifyPipeline(filePath, harness.projectRoot);

          expect(result1.exitCode).toBe(result2.exitCode);
          expect(result1.lines).toEqual(result2.lines);
        },
      ),
      { numRuns: 20 },
    );
  });
});
