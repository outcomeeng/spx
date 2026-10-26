/**
 * Harness for reading a product tree whose node directories nest kinds the assembly may or may not
 * admit, under a methodology declaration.
 *
 * It materializes either an inert fixture tree or a generated directory layout into a temporary
 * product directory, writes the product configuration that carries the declaration, and hands the
 * test a handle that reads the tree through the filesystem source. The harness returns the read
 * and judges nothing; the linked test states whether the read assembles or fails.
 *
 * @module harnesses/spec-tree/kind-containment
 */

import { cp } from "node:fs/promises";
import { join, resolve } from "node:path";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import type { GrammarSelectionDeclaration } from "@testing/harnesses/spec-tree/grammar-selection";
import { withTestEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

export const KIND_CONTAINMENT_FIXTURE = {
  /** Two node directories whose parents' kinds do not admit their kinds, beside a conforming pair. */
  TWO_VIOLATIONS: "two-violations",
} as const;

export type KindContainmentFixture = (typeof KIND_CONTAINMENT_FIXTURE)[keyof typeof KIND_CONTAINMENT_FIXTURE];

export type KindContainmentEnv = {
  /** Reads the tree through the filesystem source created for the product directory. */
  read(): Promise<SpecTreeSnapshot>;
};

const FIXTURE_ROOT = resolve(__dirname, "../../fixtures/spec-tree/kind-containment");
const FIXTURE_TREE_DIRECTORY = "tree";
const LAYOUT_ROOT_SPEC = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, `gradient${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`]
  .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
const LAYOUT_ROOT_SPEC_CONTENTS = ["---", `kind: ${SPEC_TREE_CONFIG.PRODUCT.KIND}`, "---", "", "# Gradient", ""].join(
  "\n",
);

function readerFor(productDir: string): KindContainmentEnv {
  return { read: () => readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) }) };
}

export async function withKindContainmentFixtureEnv<T>(
  fixture: KindContainmentFixture,
  declaration: GrammarSelectionDeclaration,
  callback: (env: KindContainmentEnv) => Promise<T>,
): Promise<T> {
  return withTestEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await cp(join(FIXTURE_ROOT, fixture, FIXTURE_TREE_DIRECTORY), env.productDir, { recursive: true });
    return callback(readerFor(env.productDir));
  });
}

/** Materializes the given node directories, each a path below the spec-tree root directory, beside a root spec. */
export async function withKindContainmentLayoutEnv<T>(
  declaration: GrammarSelectionDeclaration,
  directoryPaths: readonly string[],
  callback: (env: KindContainmentEnv) => Promise<T>,
): Promise<T> {
  return withTestEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await env.writeRaw(LAYOUT_ROOT_SPEC, LAYOUT_ROOT_SPEC_CONTENTS);
    for (const directoryPath of directoryPaths) {
      await writeOrderedDirectory(env, directoryPath);
    }
    return callback(readerFor(env.productDir));
  });
}
