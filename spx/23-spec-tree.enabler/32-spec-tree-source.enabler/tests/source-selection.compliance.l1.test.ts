import { describe, expect, it } from "vitest";

import { declaredGrammarComplianceCases } from "@testing/generators/spec-tree/grammar-selection";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { withGrammarSelectionEnv } from "@testing/harnesses/spec-tree/grammar-selection";

describe("declared grammar selection", () => {
  it.each(declaredGrammarComplianceCases())(SPEC_TREE_CASE_TITLE, async ({ fixture, declaration }) => {
    await withGrammarSelectionEnv(fixture, declaration, async (env) => {
      const expectation = await env.expectation();
      const snapshot = await env.read();
      const validIds = snapshot.allNodes.map((node) => node.id);
      expect(validIds).toEqual(expectation.valid);
      for (const id of [...expectation.superseded, ...expectation.invalid]) {
        expect(validIds).not.toContain(id);
      }
      expect(snapshot.superseded.map((entry) => entry.id)).toEqual(expectation.superseded);
      expect(snapshot.residual.map((entry) => entry.id)).toEqual(expectation.invalid);
    });
  });
});
