import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import { crossVersionContainmentCases } from "@testing/generators/spec-tree/kind-containment";
import { GRAMMAR_SELECTION_DECLARATION_FIELD } from "@testing/harnesses/spec-tree/grammar-selection";
import { withKindContainmentLayoutEnv } from "@testing/harnesses/spec-tree/kind-containment";

describe("kind containment across naming-schema versions", () => {
  it.each(crossVersionContainmentCases())(
    "assembles a $label under a 4.0 target with a 3.2 migration source",
    async ({ layout }) => {
      await withKindContainmentLayoutEnv(
        {
          [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
            arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
          ),
          [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]: sampleGeneratedValue(
            arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO),
          ),
        },
        layout.nodes.map((node) => node.directoryPath),
        async (env) => {
          const snapshot = await env.read();

          const child = snapshot.allNodes.find((node) => node.id === layout.child.directoryPath);
          expect(child?.parentId).toBe(layout.parent.directoryPath);
          expect(snapshot.residual).toEqual([]);
        },
      );
    },
  );
});
