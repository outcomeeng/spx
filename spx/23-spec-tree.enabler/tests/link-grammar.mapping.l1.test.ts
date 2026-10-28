import { describe, expect, it } from "vitest";

import { SPEC_TREE_LINK_KIND, specTreeLinkGrammar } from "@/lib/spec-tree";
import { LINK_GRAMMAR_SELECTION, linkKindCases } from "@testing/generators/spec-tree/link-grammar";

describe("link target to link kind", () => {
  it("covers every link kind the grammar declares", () => {
    expect(new Set(linkKindCases().map(({ kind }) => kind))).toEqual(new Set(Object.values(SPEC_TREE_LINK_KIND)));
  });

  it.each(linkKindCases())("maps $title to its link kind and its resolved path", (testCase) => {
    const grammar = specTreeLinkGrammar(LINK_GRAMMAR_SELECTION);

    const link = grammar.parseSpecTreeLink(testCase.href);

    expect(link.kind).toBe(testCase.kind);
    expect(grammar.resolveSpecTreeLink(testCase.citingDocumentPath, link)).toBe(testCase.resolvedPath);
  });
});
