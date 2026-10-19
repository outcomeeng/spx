import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  recognizeSpecTreeFilesystemEntry,
  selectSpecTreeGrammar,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_FILESYSTEM_RECORD_TYPE,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_METHODOLOGY_LINE,
} from "@/lib/spec-tree";
import { declarationSelectionCases, majorComponent } from "@testing/generators/spec-tree/grammar-selection";
import { orderedDirectoryName } from "@testing/generators/spec-tree/spec-tree";

describe("methodology declaration to valid naming-schema versions", () => {
  it.each(declarationSelectionCases())("selects the versions of $selectedMajors for $label", (testCase) => {
    const selection = selectSpecTreeGrammar(testCase.declaration);

    const expected = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS
      .map(({ version }) => version)
      .filter((version) => testCase.selectedMajors.includes(majorComponent(version)));

    expect(new Set(selection.selected.map(({ version }) => version))).toEqual(new Set(expected));
  });

  it("names on each version the methodology lines it serves: none for the first, the 3.x lines for the 3.x version, the 4.0 line for the 4.0 version", () => {
    for (const known of SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS) {
      const expectedLines = Object.values(SPEC_TREE_METHODOLOGY_LINE)
        .filter((line) => majorComponent(line) === majorComponent(known.version));

      expect(new Set(known.lines)).toEqual(new Set(expectedLines));
    }
  });

  it.each(declarationSelectionCases())(
    "reads a .capability node directory under $label as valid on the 4.0 line and superseded on a 3.x line",
    (testCase) => {
      const selection = selectSpecTreeGrammar(testCase.declaration);

      const entry = recognizeSpecTreeFilesystemEntry(
        {
          type: SPEC_TREE_FILESYSTEM_RECORD_TYPE.DIRECTORY,
          relativePath: orderedDirectoryName(KIND_REGISTRY.capability.suffix),
        },
        { schemaVersions: selection.known, selectedVersions: selection.selected },
      );

      const declaresFourZero = majorComponent(testCase.declaration.version)
        === majorComponent(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
      expect(entry?.type).toBe(declaresFourZero ? SPEC_TREE_ENTRY_TYPE.NODE : SPEC_TREE_ENTRY_TYPE.SUPERSEDED);
    },
  );
});
