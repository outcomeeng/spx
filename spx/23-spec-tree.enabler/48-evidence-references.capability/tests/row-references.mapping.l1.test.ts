import { describe, expect, it } from "vitest";

import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitrarySpecOfAssertionLines,
  evidenceReadingDeclaration,
  ROW_REFERENCE_CASES,
} from "@testing/generators/spec-tree/evidence-references";
import { readEvidenceSpecsUnderDeclaration } from "@testing/harnesses/spec-tree/evidence-references";

describe("row-references: the reference an untagged row or heading declares by its leading slug", () => {
  it.each(ROW_REFERENCE_CASES.map((rowCase) => [rowCase.label, rowCase] as const))("%s", async (_label, rowCase) => {
    const spec = sampleGeneratedValue(arbitrarySpecOfAssertionLines(rowCase.lines, rowCase.presentTargetPaths));

    const snapshot = await readEvidenceSpecsUnderDeclaration([spec], evidenceReadingDeclaration(rowCase.declaration));

    expect(snapshot.allNodes.find(({ slug }) => slug === spec.entry.slug)?.evidenceReferences).toEqual(
      rowCase.expected,
    );
  });
});
