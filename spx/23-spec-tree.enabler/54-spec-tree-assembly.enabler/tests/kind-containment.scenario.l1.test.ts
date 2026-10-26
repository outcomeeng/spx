import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_GRAMMAR, SPEC_TREE_METHODOLOGY_LINE, type SpecTreeNodeKind } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import { GRAMMAR_SELECTION_DECLARATION_FIELD } from "@testing/harnesses/spec-tree/grammar-selection";
import { KIND_CONTAINMENT_FIXTURE, withKindContainmentFixtureEnv } from "@testing/harnesses/spec-tree/kind-containment";

type Violation = {
  readonly parent: { readonly directory: string; readonly kind: SpecTreeNodeKind };
  readonly child: { readonly directory: string; readonly kind: SpecTreeNodeKind };
};

describe("kind containment in assembly", () => {
  it("fails the read naming each child and parent whose kinds the parent does not admit", async () => {
    const violations: readonly Violation[] = [
      {
        parent: { directory: `10-ledger${KIND_REGISTRY.substrate.suffix}`, kind: "substrate" },
        child: { directory: `20-console${KIND_REGISTRY.surface.suffix}`, kind: "surface" },
      },
      {
        parent: { directory: `20-routing${KIND_REGISTRY.domain.suffix}`, kind: "domain" },
        child: { directory: `10-panel${KIND_REGISTRY.interface.suffix}`, kind: "interface" },
      },
    ];

    await withKindContainmentFixtureEnv(
      KIND_CONTAINMENT_FIXTURE.TWO_VIOLATIONS,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        const message = (failure as Error).message;
        for (const { parent, child } of violations) {
          expect(message).toContain([parent.directory, child.directory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR));
          expect(message).toContain(child.kind);
          expect(message).toContain(parent.directory);
          expect(message).toContain(parent.kind);
        }
      },
    );
  });
});
