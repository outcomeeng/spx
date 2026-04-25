/**
 * Scenario tests for path validation.
 *
 * Test Level: 1 (Unit)
 * - Uses temp directories as project root; no external infrastructure
 *
 * Assertions covered from paths.md:
 * - S1: All paths exist under project root → no defects
 * - S2: Path escapes project root → "path escapes project root" defect
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { validatePaths } from "@/audit/paths";
import type { AuditVerdict } from "@/audit/reader";

const DEFECT_ESCAPES_ROOT = "path escapes project root";

const VALID_HEADER = {
  spec_node: "spx/36-audit.enabler",
  verdict: "APPROVED",
  timestamp: "2024-01-01_00-00-00",
};

describe("validatePaths: scenarios", () => {
  it("GIVEN a verdict whose findings reference files that all exist under the project root WHEN path validation runs THEN no defects are reported", async () => {
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
            status: "PASS",
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

      const defects = validatePaths(verdict, root);

      expect(defects).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("GIVEN a verdict with a path that escapes the project root WHEN path validation runs THEN it reports a 'path escapes project root' defect", async () => {
    const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
    try {
      const verdict: AuditVerdict = {
        header: VALID_HEADER,
        gates: [
          {
            name: "architecture",
            status: "PASS",
            count: "1",
            findings: [{ spec_file: "../../etc/passwd" }],
          },
        ],
      };

      const defects = validatePaths(verdict, root);

      const defect = defects.find((d) => d.includes(DEFECT_ESCAPES_ROOT));
      expect(defect).toBeDefined();
      expect(defect).toContain("../../etc/passwd");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
