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

import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE } from "@/audit/reader";
import type { AuditHarness, AuditVerdictXmlFindingFixture } from "@/audit/testing/harness";
import {
  AUDIT_VERDICT_XML_SKIPPED_REASON_FIXTURE,
  createAuditHarness,
  renderAuditVerdictXml,
} from "@/audit/testing/harness";
import { runVerifyPipeline } from "@/audit/verify";

function buildFindings(count: number): readonly AuditVerdictXmlFindingFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    specFile: `spec${index}.md`,
    testFile: `test${index}.ts`,
  }));
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
          verdict: fc.constantFrom(...Object.values(AUDIT_VERDICT_VALUE)),
          gates: fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              status: fc.constantFrom(...Object.values(AUDIT_GATE_STATUS)),
              findings: fc.integer({ min: 0, max: 3 }),
            }),
            { minLength: 1, maxLength: 3 },
          ),
        }),
        async ({ verdict, gates }) => {
          const xml = renderAuditVerdictXml({
            specNode: "spx/36-audit.enabler",
            verdict,
            timestamp: "2024-01-01_00-00-00",
            gates: gates.map((gate, index) => ({
              name: gate.name || `gate${index}`,
              status: gate.status,
              skippedReason: gate.status === AUDIT_GATE_STATUS.SKIPPED
                ? AUDIT_VERDICT_XML_SKIPPED_REASON_FIXTURE
                : undefined,
              findings: buildFindings(gate.findings),
            })),
          });

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
