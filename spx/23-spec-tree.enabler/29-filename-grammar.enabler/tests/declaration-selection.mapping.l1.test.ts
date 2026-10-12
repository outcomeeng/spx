import { describe, expect, it } from "vitest";

import { selectSpecTreeGrammar, SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS } from "@/lib/spec-tree";
import { declarationSelectionCases, majorComponent } from "@testing/generators/spec-tree/grammar-selection";

describe("methodology declaration to valid naming-schema versions", () => {
  it.each(declarationSelectionCases())("selects the versions of $selectedMajors for $label", (testCase) => {
    const selection = selectSpecTreeGrammar(testCase.declaration);

    const expected = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS
      .map(({ version }) => version)
      .filter((version) => testCase.selectedMajors.includes(majorComponent(version)));

    expect(new Set(selection.selected.map(({ version }) => version))).toEqual(new Set(expected));
  });
});
