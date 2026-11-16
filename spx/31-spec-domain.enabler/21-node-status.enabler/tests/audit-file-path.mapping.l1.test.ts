import { describe, expect, it } from "vitest";

import { nodeStatusAuditFilePath } from "@/lib/node-status";
import { auditFilePathCases } from "@testing/generators/node-status/audit-file";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("the Audit File vocabulary maps each claim entry to its Audit File path relative to its node", () => {
  it.each(auditFilePathCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(nodeStatusAuditFilePath(testCase.entry)).toBe(testCase.expected);
  });
});
