/**
 * Harness for reading a product tree whose node directories nest kinds the assembly may or may not
 * admit, under a methodology declaration.
 *
 * It materializes a generated directory layout into a temporary product directory, writes the product configuration that carries the declaration, and hands the
 * test a handle that reads the tree through the filesystem source. The harness returns the read
 * and judges nothing; the linked test states whether the read assembles or fails.
 *
 * @module harnesses/spec-tree/kind-containment
 */

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

export type KindContainmentEnv = {
  /** Reads the tree through the filesystem source created for the product directory. */
  read(): Promise<SpecTreeSnapshot>;
};

/** The file name of the root spec the layout materializes, which a failure names as the root's path. */
export const KIND_CONTAINMENT_ROOT_SPEC_FILE = `gradient${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`;
const LAYOUT_ROOT_SPEC = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, KIND_CONTAINMENT_ROOT_SPEC_FILE]
  .join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
const LAYOUT_ROOT_SPEC_CONTENTS = ["---", `kind: ${SPEC_TREE_CONFIG.PRODUCT.KIND}`, "---", "", "# Gradient", ""].join(
  "\n",
);

function readerFor(productDir: string): KindContainmentEnv {
  return { read: () => readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) }) };
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
