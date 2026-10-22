import { describe, expect, it } from "vitest";

import { acceptsKnowledgeRoot } from "@/lib/spec-tree";
import { knowledgeRootCases } from "@testing/generators/spec-tree/lane-directories";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("knowledge-root entries of the 4.0 naming-schema version", () => {
  it.each(knowledgeRootCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    for (const version of recognitionOptionsForLine(testCase.line).selectedVersions) {
      expect(acceptsKnowledgeRoot(version, testCase.holder, testCase.pathFromNode, testCase.entryKind)).toBe(
        testCase.accepted,
      );
    }
  });
});
