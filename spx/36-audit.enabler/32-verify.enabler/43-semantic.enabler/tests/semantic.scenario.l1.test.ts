/**
 * Scenario tests for semantic validation.
 *
 * Test Level: 1 (Unit)
 * - Pure function over in-memory AuditVerdict; no file I/O
 *
 * Assertions covered from semantic.md:
 * - S1: APPROVED + all gates PASS → no defects
 * - S2: APPROVED + at least one gate FAIL → "incoherent verdict" defect
 * - S3: REJECT + at least one gate FAIL → no defects
 * - S4: REJECT + all gates PASS → "incoherent verdict" defect
 * - S5: FAIL gate + zero findings → "failed gate has no findings" defect naming the gate
 * - S6: SKIPPED gate + no skipped_reason → "skipped gate missing reason" defect
 */

import { describe, expect, it } from "vitest";

import type { AuditVerdict } from "@/audit/reader";
import { validateSemantics } from "@/audit/semantic";

const DEFECT_INCOHERENT_VERDICT = "incoherent verdict";
const DEFECT_FAILED_NO_FINDINGS = "failed gate has no findings";
const DEFECT_SKIPPED_NO_REASON = "skipped gate missing reason";

const VALID_HEADER_APPROVED = {
  spec_node: "spx/36-audit.enabler",
  verdict: "APPROVED",
  timestamp: "2024-01-01_00-00-00",
};

const VALID_HEADER_REJECT = {
  spec_node: "spx/36-audit.enabler",
  verdict: "REJECT",
  timestamp: "2024-01-01_00-00-00",
};

const PASS_GATE = {
  name: "architecture",
  status: "PASS",
  count: "0",
  findings: [] as const,
};

const FAIL_GATE = {
  name: "tests",
  status: "FAIL",
  count: "1",
  findings: [{ spec_file: "spec.md", test_file: "test.ts" }] as const,
};

const FAIL_GATE_NO_FINDINGS = {
  name: "tests",
  status: "FAIL",
  count: "0",
  findings: [] as const,
};

const SKIPPED_GATE_NO_REASON = {
  name: "paths",
  status: "SKIPPED",
  count: "0",
  findings: [] as const,
};

describe("validateSemantics: scenarios", () => {
  it("GIVEN a verdict with overall verdict APPROVED and all gates PASS WHEN semantic validation runs THEN no defects are reported", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_APPROVED,
      gates: [PASS_GATE],
    };

    const defects = validateSemantics(verdict);

    expect(defects).toHaveLength(0);
  });

  it("GIVEN a verdict with overall verdict APPROVED and at least one gate FAIL WHEN semantic validation runs THEN it reports an 'incoherent verdict' defect", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_APPROVED,
      gates: [FAIL_GATE],
    };

    const defects = validateSemantics(verdict);

    expect(defects).toContainEqual(expect.stringContaining(DEFECT_INCOHERENT_VERDICT));
  });

  it("GIVEN a verdict with overall verdict REJECT and at least one gate FAIL WHEN semantic validation runs THEN no defects are reported", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_REJECT,
      gates: [FAIL_GATE],
    };

    const defects = validateSemantics(verdict);

    expect(defects).toHaveLength(0);
  });

  it("GIVEN a verdict with overall verdict REJECT and all gates PASS WHEN semantic validation runs THEN it reports an 'incoherent verdict' defect", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_REJECT,
      gates: [PASS_GATE],
    };

    const defects = validateSemantics(verdict);

    expect(defects).toContainEqual(expect.stringContaining(DEFECT_INCOHERENT_VERDICT));
  });

  it("GIVEN a gate with status FAIL and zero findings WHEN semantic validation runs THEN it reports a 'failed gate has no findings' defect naming the gate", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_REJECT,
      gates: [FAIL_GATE_NO_FINDINGS],
    };

    const defects = validateSemantics(verdict);

    const defect = defects.find((d) => d.includes(DEFECT_FAILED_NO_FINDINGS));
    expect(defect).toBeDefined();
    expect(defect).toContain(FAIL_GATE_NO_FINDINGS.name);
  });

  it("GIVEN a gate with status SKIPPED and no skipped_reason WHEN semantic validation runs THEN it reports a 'skipped gate missing reason' defect", () => {
    const verdict: AuditVerdict = {
      header: VALID_HEADER_REJECT,
      gates: [SKIPPED_GATE_NO_REASON],
    };

    const defects = validateSemantics(verdict);

    expect(defects).toContainEqual(expect.stringContaining(DEFECT_SKIPPED_NO_REASON));
  });
});
