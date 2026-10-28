import { describe, expect, it } from "vitest";

import { admitsSpecTreeLinkText, specTreeLinkGrammar } from "@/lib/spec-tree";
import {
  decisionCitationCases,
  decisionPathTextCases,
  evidenceLinkCases,
  LINK_GRAMMAR_SELECTION,
} from "@testing/generators/spec-tree/link-grammar";

describe("decision citation binding", () => {
  it.each(decisionCitationCases())("binds $title to the decision it names, or to none", (testCase) => {
    const grammar = specTreeLinkGrammar(LINK_GRAMMAR_SELECTION);

    expect(grammar.resolveSpecTreeDecisionCitation(testCase.citingDocumentPath, testCase.href)).toBe(
      testCase.citedPath,
    );
  });

  it.each(decisionPathTextCases())("reports $title as written text, which cites no decision", (testCase) => {
    const grammar = specTreeLinkGrammar(LINK_GRAMMAR_SELECTION);

    expect(grammar.decisionPathsWrittenAsText(testCase.text)).toEqual([testCase.writtenPath]);
  });
});

describe("evidence link admission", () => {
  it.each(evidenceLinkCases())("admits or rejects $title", (testCase) => {
    const grammar = specTreeLinkGrammar(LINK_GRAMMAR_SELECTION);

    expect(admitsSpecTreeLinkText(testCase.linkText, grammar.parseSpecTreeLink(testCase.href))).toBe(
      testCase.admitted,
    );
  });
});
