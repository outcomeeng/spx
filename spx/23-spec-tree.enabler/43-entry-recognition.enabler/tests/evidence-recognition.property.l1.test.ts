import { describe, expect, it } from "vitest";

import {
  recognizeSpecTreeFilesystemEntry,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
} from "@/lib/spec-tree";
import { arbitraryEvidenceRecognitionCase } from "@testing/generators/spec-tree/filename-grammar";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("evidence recognition", () => {
  it("maps every generated canonical evidence filename under tests to evidence under each methodology line", () => {
    assertProperty(
      arbitraryEvidenceRecognitionCase(),
      (testCase) => {
        const entry = recognizeSpecTreeFilesystemEntry(
          {
            type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.FILE,
            relativePath: testCase.relativePath,
            parentId: testCase.parentId,
          },
          recognitionOptionsForLine(testCase.line),
        );

        expect(entry).toMatchObject({ type: SPEC_TREE_ENTRY_TYPE.EVIDENCE, parentId: testCase.parentId });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
