import { describe, expect, it } from "vitest";

import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import { arbitraryRejectedLayoutPair } from "@testing/generators/spec-tree/kind-containment";
import { GRAMMAR_SELECTION_DECLARATION_FIELD } from "@testing/harnesses/spec-tree/grammar-selection";
import { withKindContainmentLayoutEnv } from "@testing/harnesses/spec-tree/kind-containment";

describe("kind containment in assembly", () => {
  it("fails the read naming each child and parent whose kinds the parent does not admit", async () => {
    const layouts = sampleGeneratedValue(arbitraryRejectedLayoutPair());

    await withKindContainmentLayoutEnv(
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
      layouts.flatMap(({ nodes }) => nodes.map((node) => node.directoryPath)),
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        const message = (failure as Error).message;
        for (const { parent, child } of layouts) {
          expect(message).toContain(child.directoryPath);
          expect(message).toContain(child.kind);
          expect(message).toContain(parent.directoryPath);
          expect(message).toContain(parent.kind);
        }
      },
    );
  });
});
