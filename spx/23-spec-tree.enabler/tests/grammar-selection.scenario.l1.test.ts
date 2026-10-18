import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryOutputKindFixture,
  arbitraryUnsupportedVersion,
  arbitraryVersionOnLine,
  grammarSelectionLines,
  MALFORMED_ROOT_SPEC_TEXTS,
} from "@testing/generators/spec-tree/grammar-selection";
import { SPEC_TREE_TEST_GENERATOR, specTreeFixtureNodeDirectoryName } from "@testing/generators/spec-tree/spec-tree";
import {
  GRAMMAR_SELECTION_DECLARATION_FIELD,
  GRAMMAR_SELECTION_FIXTURE,
  readFixtureUnderDeclaredLine,
  withGrammarSelectionEnv,
} from "@testing/harnesses/spec-tree/grammar-selection";

describe("declaration-selected grammar", () => {
  it("reads a tree in the 4.0 grammar when the declared version is on the 4.0 line", async () => {
    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.FOUR_LINE,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
      async (env) => {
        const expectation = await env.expectation();
        const snapshot = await env.read();

        expect(snapshot.product?.id).toBe(expectation.product);
        expect(snapshot.allNodes.map(({ id }) => id)).toEqual(expectation.valid);
        expect(snapshot.superseded.map(({ id }) => id)).toEqual(expectation.superseded);
        expect(snapshot.residual.map(({ id }) => id)).toEqual(expectation.invalid);
      },
    );
  });

  it("reads a tree in the 3.x grammar when the declared version is on the 3.2 line", async () => {
    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.THREE_LINE,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO),
        ),
      },
      async (env) => {
        const expectation = await env.expectation();
        const snapshot = await env.read();

        expect(snapshot.product?.id).toBe(expectation.product);
        expect(snapshot.allNodes.map(({ id }) => id)).toEqual(expectation.valid);
        expect(snapshot.superseded.map(({ id }) => id)).toEqual(expectation.superseded);
        expect(snapshot.residual.map(({ id }) => id)).toEqual(expectation.invalid);
      },
    );
  });

  it("reads both grammars into one tree when a 3.2 migration source accompanies a 4.0 target", async () => {
    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.MIGRATING,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
        [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO),
        ),
      },
      async (env) => {
        const expectation = await env.expectation();
        const snapshot = await env.read();

        expect(snapshot.product?.id).toBe(expectation.product);
        expect(snapshot.allNodes.map(({ id }) => id)).toEqual(expectation.valid);
        expect(snapshot.superseded.map(({ id }) => id)).toEqual(expectation.superseded);
        expect(snapshot.residual.map(({ id }) => id)).toEqual(expectation.invalid);
      },
    );
  });

  it("fails the read naming an unsupported declared version and the lines SPX reads", async () => {
    const version = sampleGeneratedValue(arbitraryUnsupportedVersion());

    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.FOUR_LINE,
      { [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: version },
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(version);
        for (const line of grammarSelectionLines()) {
          expect((failure as Error).message).toContain(line);
        }
      },
    );
  });

  it("fails the read naming an unsupported migration source and the lines SPX reads", async () => {
    const migratingFrom = sampleGeneratedValue(arbitraryUnsupportedVersion());

    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.MIGRATING,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
        [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]: migratingFrom,
      },
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toContain(migratingFrom);
        for (const line of grammarSelectionLines()) {
          expect((failure as Error).message).toContain(line);
        }
      },
    );
  });

  it("fails the read naming each root spec when the tree holds more than one", async () => {
    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.TWO_ROOTS,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
        [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO),
        ),
      },
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        for (const path of await env.rootFilePaths()) {
          expect((failure as Error).message).toContain(path);
        }
      },
    );
  });

  it("fails the read naming a 4.0 root spec whose front matter does not declare the product kind", async () => {
    await withGrammarSelectionEnv(
      GRAMMAR_SELECTION_FIXTURE.ROOT_WITHOUT_KIND,
      {
        [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
          arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
        ),
      },
      async (env) => {
        const failure = await env.read().then(() => undefined, (error: unknown) => error);

        expect(failure).toBeInstanceOf(Error);
        for (const path of await env.rootFilePaths()) {
          expect((failure as Error).message).toContain(path);
        }
      },
    );
  });

  it("fails the read naming a 4.0 root spec whose front matter is not valid YAML", async () => {
    for (const rootFileText of MALFORMED_ROOT_SPEC_TEXTS) {
      await withGrammarSelectionEnv(
        GRAMMAR_SELECTION_FIXTURE.ROOT_WITHOUT_KIND,
        {
          [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: sampleGeneratedValue(
            arbitraryVersionOnLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO),
          ),
        },
        async (env) => {
          const failure = await env.read().then(() => undefined, (error: unknown) => error);

          expect(failure).toBeInstanceOf(Error);
          for (const path of await env.rootFilePaths()) {
            expect((failure as Error).message).toContain(path);
          }
        },
        { rootFileText },
      );
    }
  });

  it("classifies one materialized tree with a 3.x node kind as valid under a 3.2 declaration and superseded under a 4.0 declaration", async () => {
    const fixture = sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY));

    const underThreeTwo = await readFixtureUnderDeclaredLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO, fixture);
    const underFourZero = await readFixtureUnderDeclaredLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO, fixture);
    const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);

    expect(underThreeTwo.allNodes.map(({ id }) => id)).toContain(rootDirectory);
    expect(underFourZero.allNodes.map(({ id }) => id)).not.toContain(rootDirectory);
    expect(underFourZero.superseded.map(({ id }) => id)).toContain(rootDirectory);
  });

  it("classifies one materialized tree with a 4.0 output node kind as invalid under a 3.2 declaration and valid under a 4.0 declaration", async () => {
    const fixture = sampleGeneratedValue(arbitraryOutputKindFixture(KIND_REGISTRY));

    const underThreeTwo = await readFixtureUnderDeclaredLine(SPEC_TREE_METHODOLOGY_LINE.THREE_TWO, fixture);
    const underFourZero = await readFixtureUnderDeclaredLine(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO, fixture);
    const rootDirectory = specTreeFixtureNodeDirectoryName(KIND_REGISTRY, fixture.root);

    expect(underFourZero.allNodes.map(({ id }) => id)).toContain(rootDirectory);
    expect(underThreeTwo.allNodes.map(({ id }) => id)).not.toContain(rootDirectory);
    expect(underThreeTwo.residual.map(({ id }) => id)).toContain(rootDirectory);
  });
});
