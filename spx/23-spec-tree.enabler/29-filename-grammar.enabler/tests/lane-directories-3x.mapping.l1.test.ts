import { describe, expect, it } from "vitest";

import { acceptsKnowledgeRoot, acceptsProbeEntry } from "@/lib/spec-tree";
import { threeXLaneDirectoryCases } from "@testing/generators/spec-tree/lane-directories";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("knowledge-root and probe-lane entries of the 3.x naming-schema version", () => {
  it.each(threeXLaneDirectoryCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    for (const version of recognitionOptionsForLine(testCase.line).selectedVersions) {
      expect(acceptsKnowledgeRoot(version, testCase.pathFromNode, testCase.entryKind)).toBe(testCase.accepted);
      expect(acceptsProbeEntry(version, testCase.pathFromNode, testCase.entryKind)).toBe(testCase.accepted);
    }
  });
});
