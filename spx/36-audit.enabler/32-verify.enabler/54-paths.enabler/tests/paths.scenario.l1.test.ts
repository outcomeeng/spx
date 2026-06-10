/**
 * Scenario tests for path validation.
 *
 * Test Level: 1 (Unit)
 * - Uses temp directories as product directory; no external infrastructure
 *
 * Assertions covered from paths.md:
 * - S1: All paths exist under product directory → no defects
 * - S2: Path escapes product directory → "path escapes product directory" defect
 */

import { AUDIT_PATH_DEFECT, validatePaths } from "@/domains/audit/paths";
import { AUDIT_GATE_STATUS, AUDIT_VERDICT_VALUE, AuditVerdict } from "@/domains/audit/reader";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const VALID_HEADER = {
  spec_node: "spx/36-audit.enabler",
  verdict: AUDIT_VERDICT_VALUE.APPROVED,
  timestamp: "2024-01-01_00-00-00",
};

describe("validatePaths: scenarios", () => {
  it("GIVEN a verdict whose findings reference files that all exist under the product directory WHEN path validation runs THEN no defects are reported", async () => {
    const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
    try {
      await mkdir(join(root, "spx", "36-audit.enabler", "tests"), { recursive: true });
      await writeFile(join(root, "spx", "36-audit.enabler", "structural.md"), "");
      await writeFile(join(root, "spx", "36-audit.enabler", "tests", "structural.test.ts"), "");

      const verdict: AuditVerdict = {
        header: VALID_HEADER,
        gates: [
          {
            name: "architecture",
            status: AUDIT_GATE_STATUS.PASS,
            count: "1",
            findings: [
              {
                spec_file: "spx/36-audit.enabler/structural.md",
                test_file: "spx/36-audit.enabler/tests/structural.test.ts",
              },
            ],
          },
        ],
      };

      const defects = validatePaths(verdict, root, existsSync);

      expect(defects).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("GIVEN the injected existence reader reports false for an existing verdict path WHEN path validation runs THEN it reports a missing-file defect", async () => {
    const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
    try {
      const specPath = "spx/36-audit.enabler/structural.md";
      await mkdir(join(root, "spx", "36-audit.enabler"), { recursive: true });
      await writeFile(join(root, specPath), "");
      const verdict: AuditVerdict = {
        header: VALID_HEADER,
        gates: [
          {
            name: "architecture",
            status: AUDIT_GATE_STATUS.PASS,
            count: "1",
            findings: [{ spec_file: specPath }],
          },
        ],
      };

      const defects = validatePaths(verdict, root, () => false);

      const defect = defects.find((d) => d.includes(AUDIT_PATH_DEFECT.MISSING_FILE));
      expect(defect).toBeDefined();
      expect(defect).toContain(specPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("GIVEN an existing product file whose relative path starts with two dots WHEN path validation runs THEN no escape defect is reported", async () => {
    const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
    try {
      const insidePath = "..inside-product.md";
      await writeFile(join(root, insidePath), "");
      const verdict: AuditVerdict = {
        header: VALID_HEADER,
        gates: [
          {
            name: "architecture",
            status: AUDIT_GATE_STATUS.PASS,
            count: "1",
            findings: [{ spec_file: insidePath }],
          },
        ],
      };

      const defects = validatePaths(verdict, root, existsSync);

      expect(defects).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("GIVEN a verdict with a path that escapes the product directory WHEN path validation runs THEN it reports a 'path escapes product directory' defect", async () => {
    const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
    try {
      const escapingPath = "../../etc/passwd";
      const verdict: AuditVerdict = {
        header: VALID_HEADER,
        gates: [
          {
            name: "architecture",
            status: AUDIT_GATE_STATUS.PASS,
            count: "1",
            findings: [{ spec_file: escapingPath }],
          },
        ],
      };

      const defects = validatePaths(verdict, root, existsSync);

      const defect = defects.find((d) => d.includes(AUDIT_PATH_DEFECT.ESCAPES_ROOT));
      expect(defect).toBeDefined();
      expect(defect).toContain(escapingPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
