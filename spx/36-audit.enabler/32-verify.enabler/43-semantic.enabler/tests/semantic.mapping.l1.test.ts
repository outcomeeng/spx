/**
 * Mapping tests for semantic validation.
 *
 * Test Level: 1 (Unit)
 * - Pure function over in-memory AuditVerdict; no file I/O
 *
 * Assertions covered from semantic.md:
 * - M1: Each of the six gate-status/verdict combinations maps to coherent or "incoherent verdict" defect:
 *   1. All PASS + APPROVED → coherent
 *   2. All PASS + REJECT → "incoherent verdict"
 *   3. Any FAIL + REJECT → coherent
 *   4. Any FAIL + APPROVED → "incoherent verdict"
 *   5. Any SKIPPED, no FAIL + REJECT → coherent
 *   6. Any SKIPPED, no FAIL + APPROVED → "incoherent verdict"
 */

import { AuditGate, AuditVerdict, AuditVerdictHeader } from "@/domains/audit/reader";
import { validateSemantics } from "@/domains/audit/semantic";
import { describe, expect, it } from "vitest";
const DEFECT_INCOHERENT_VERDICT = "incoherent verdict";

const APPROVED_HEADER: AuditVerdictHeader = {
  spec_node: "spx/36-audit.enabler",
  verdict: "APPROVED",
  timestamp: "2024-01-01_00-00-00",
};

const REJECT_HEADER: AuditVerdictHeader = {
  spec_node: "spx/36-audit.enabler",
  verdict: "REJECT",
  timestamp: "2024-01-01_00-00-00",
};

const PASS_GATE: AuditGate = {
  name: "architecture",
  status: "PASS",
  count: "0",
  findings: [],
};

const FAIL_GATE: AuditGate = {
  name: "tests",
  status: "FAIL",
  count: "1",
  findings: [{ spec_file: "spec.md", test_file: "test.ts" }],
};

const SKIPPED_GATE: AuditGate = {
  name: "paths",
  status: "SKIPPED",
  skipped_reason: "Not applicable for this node",
  count: "0",
  findings: [],
};

const COHERENCE_CASES: Array<{
  label: string;
  header: AuditVerdictHeader;
  gates: AuditGate[];
  expectsDefect: boolean;
}> = [
  {
    label: "all gates PASS + overall APPROVED",
    header: APPROVED_HEADER,
    gates: [PASS_GATE],
    expectsDefect: false,
  },
  {
    label: "all gates PASS + overall REJECT",
    header: REJECT_HEADER,
    gates: [PASS_GATE],
    expectsDefect: true,
  },
  {
    label: "any gate FAIL + overall REJECT",
    header: REJECT_HEADER,
    gates: [FAIL_GATE],
    expectsDefect: false,
  },
  {
    label: "any gate FAIL + overall APPROVED",
    header: APPROVED_HEADER,
    gates: [FAIL_GATE],
    expectsDefect: true,
  },
  {
    label: "any gate SKIPPED no FAIL + overall REJECT",
    header: REJECT_HEADER,
    gates: [SKIPPED_GATE],
    expectsDefect: false,
  },
  {
    label: "any gate SKIPPED no FAIL + overall APPROVED",
    header: APPROVED_HEADER,
    gates: [SKIPPED_GATE],
    expectsDefect: true,
  },
];

describe("validateSemantics: gate-status/verdict coherence mapping (M1)", () => {
  it.each(COHERENCE_CASES)(
    "GIVEN $label WHEN semantic validation runs THEN incoherent-verdict defect is $expectsDefect",
    ({ header, gates, expectsDefect }) => {
      const verdict: AuditVerdict = { header, gates };

      const hasDefect = validateSemantics(verdict).some((d) => d.includes(DEFECT_INCOHERENT_VERDICT));

      expect(hasDefect).toBe(expectsDefect);
    },
  );
});
