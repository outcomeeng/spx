import { describe, expect, it } from "vitest";

import { SPEC_TREE_CONFIG, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryVersionOnLine } from "@testing/generators/spec-tree/grammar-selection";
import {
  arbitraryRejectedLayoutPair,
  arbitraryRootRejectedChild,
} from "@testing/generators/spec-tree/kind-containment";
import { GRAMMAR_SELECTION_DECLARATION_FIELD } from "@testing/harnesses/spec-tree/grammar-selection";
import {
  KIND_CONTAINMENT_ROOT_SPEC_FILE,
  withKindContainmentLayoutEnv,
} from "@testing/harnesses/spec-tree/kind-containment";

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
        const withoutChildPaths = layouts.reduce(
          (text, { child }) => text.replaceAll(child.directoryPath, ""),
          message,
        );
        const withoutPaths = layouts.reduce(
          (text, { parent }) => text.replaceAll(parent.directoryPath, ""),
          withoutChildPaths,
        );
        for (const { parent, child } of layouts) {
          expect(message).toContain(child.directoryPath);
          expect(withoutChildPaths).toContain(parent.directoryPath);
          expect(withoutPaths).toContain(child.kind);
          expect(withoutPaths).toContain(parent.kind);
        }
      },
    );
  });

  it("fails the read naming a top-level node whose kind the root product does not admit", async () => {
    const child = sampleGeneratedValue(arbitraryRootRejectedChild());

    await withKindContainmentLayoutEnv(
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
      [child.directoryPath],
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        const message = (failure as Error).message;
        const withoutChildPath = message.replaceAll(child.directoryPath, "");
        const withoutPaths = withoutChildPath.replaceAll(KIND_CONTAINMENT_ROOT_SPEC_FILE, "");
        expect(message).toContain(child.directoryPath);
        expect(withoutChildPath).toContain(KIND_CONTAINMENT_ROOT_SPEC_FILE);
        expect(withoutPaths).toContain(child.kind);
        expect(withoutPaths).toContain(SPEC_TREE_CONFIG.PRODUCT.KIND);
      },
    );
  });
});
