import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE, type SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import {
  GRAMMAR_SELECTION_DECLARATION_FIELD,
  GRAMMAR_SELECTION_FIXTURE,
  withGrammarSelectionEnv,
} from "@testing/harnesses/spec-tree/grammar-selection";

describe("declared grammar selection", () => {
  it("classifies the names of one tree by the grammar its declaration selects", async () => {
    const readUnder = (line: SpecTreeMethodologyLine) =>
      withGrammarSelectionEnv(
        GRAMMAR_SELECTION_FIXTURE.FOUR_LINE,
        { [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(arbitraryVersionOnLine(line)) },
        (env) => env.read(),
      );

    const underFourZero = await readUnder(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO);
    const underThreeTwo = await readUnder(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO);

    const validUnderFourZero = underFourZero.allNodes.map(({ id }) => id);
    const supersededUnderFourZero = underFourZero.superseded.map(({ id }) => id);
    expect(validUnderFourZero.length).toBeGreaterThan(0);
    expect(supersededUnderFourZero.length).toBeGreaterThan(0);
    expect(underThreeTwo.allNodes.map(({ id }) => id)).toEqual(supersededUnderFourZero);
    expect(underThreeTwo.residual.map(({ id }) => id)).toEqual(validUnderFourZero);
    expect(underFourZero.residual).toEqual([]);
  });
});
