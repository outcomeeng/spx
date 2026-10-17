import { describe, expect, it } from "vitest";

import { recognizeSpecTreeFilesystemEntry } from "@/lib/spec-tree";
import { specFileFormCases } from "@testing/generators/spec-tree/filename-grammar";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("the naming-schema versions' accepted filesystem forms", () => {
  it.each(specFileFormCases())("recognizes: $title", (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(testCase.record, recognitionOptionsForLine(testCase.line));

    expect(entry).toMatchObject(testCase.expected);
  });
});
