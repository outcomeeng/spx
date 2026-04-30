/**
 * Mapping tests for path validation.
 *
 * Test Level: 1 (Unit)
 * - Uses temp directories as project root; no external infrastructure
 *
 * Assertions covered from paths.md:
 * - M1: For each path-bearing element type (spec_file, test_file), when the path does not exist
 *       under the project root, then a "missing file" defect naming the path is reported
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIT_PATH_DEFECT, validatePaths } from "@/audit/paths";
import type { AuditFinding, AuditVerdict } from "@/audit/reader";

const DEFECT_MISSING_FILE = AUDIT_PATH_DEFECT.MISSING_FILE;

const VALID_HEADER = {
  spec_node: "spx/36-audit.enabler",
  verdict: "REJECT",
  timestamp: "2024-01-01_00-00-00",
};

const PATH_BEARING_FIELDS = ["spec_file", "test_file"] as const;

describe("validatePaths: path-bearing element mapping (M1)", () => {
  it.each(PATH_BEARING_FIELDS)(
    "GIVEN a finding with a '%s' path that does not exist WHEN path validation runs THEN the defect names the path",
    async (field) => {
      const root = await mkdtemp(join(tmpdir(), "spx-paths-test-"));
      try {
        const missingPath = "spx/36-audit.enabler/nonexistent.md";
        const finding: AuditFinding = field === "spec_file"
          ? { spec_file: missingPath }
          : { test_file: missingPath };

        const verdict: AuditVerdict = {
          header: VALID_HEADER,
          gates: [
            {
              name: "architecture",
              status: "FAIL",
              count: "1",
              findings: [finding],
            },
          ],
        };

        const defects = validatePaths(verdict, root);

        const defect = defects.find((d) => d.includes(DEFECT_MISSING_FILE));
        expect(defect).toBeDefined();
        expect(defect).toContain(missingPath);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
