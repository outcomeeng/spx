import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, recognizeSpecTreeFilesystemEntry, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { kindRecognitionCases } from "@testing/generators/spec-tree/filename-grammar";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("KIND_REGISTRY", () => {
  it.each(kindRecognitionCases())("registers $kind with the category and suffix the recognizer reads", (testCase) => {
    for (const line of testCase.lines) {
      const entry = recognizeSpecTreeFilesystemEntry(testCase.record, recognitionOptionsForLine(line));

      expect(entry).toMatchObject({ type: testCase.expectedType, kind: testCase.kind });
    }
  });

  it("projects directly from the semantic config object", () => {
    expect(KIND_REGISTRY).toBe(SPEC_TREE_CONFIG.KINDS);
  });
});
