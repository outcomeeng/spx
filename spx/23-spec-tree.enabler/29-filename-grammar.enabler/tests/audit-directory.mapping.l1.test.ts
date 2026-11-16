import { describe, expect, it } from "vitest";

import { acceptsAuditEntry } from "@/lib/spec-tree";
import { auditDirectoryCases } from "@testing/generators/spec-tree/audit-directory";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("Audit File entries under a node's audits/ directory, per naming-schema version", () => {
  it.each(auditDirectoryCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    const versions = recognitionOptionsForLine(testCase.line).selectedVersions;

    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(acceptsAuditEntry(version, testCase.pathFromNode, testCase.entryKind)).toBe(testCase.accepted);
    }
  });
});
