import { describe, expect, it } from "vitest";

import { recognizeSpecTreeFilesystemEntry } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { specFileFormCases } from "@testing/generators/spec-tree/filename-grammar";
import { nodeLocalNoteCases } from "@testing/generators/spec-tree/grammar-tokens";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { recognitionOptionsForLine } from "@testing/harnesses/spec-tree/filename-grammar";

describe("the naming-schema versions' accepted filesystem forms", () => {
  it.each(specFileFormCases())("recognizes: $title", (testCase) => {
    const entry = recognizeSpecTreeFilesystemEntry(testCase.record, recognitionOptionsForLine(testCase.line));

    expect(entry).toMatchObject(testCase.expected);
  });
});

describe("the node-local notes of a naming-schema version", () => {
  it.each(nodeLocalNoteCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    for (const version of recognitionOptionsForLine(testCase.line).selectedVersions) {
      expect([...version.coordinationNotes].sort(compareAsciiStrings)).toEqual(
        [...testCase.accepted].sort(compareAsciiStrings),
      );
      for (const note of testCase.rejected) expect(version.coordinationNotes).not.toContain(note);
    }
  });
});
