/**
 * Harness for reading a product tree built from node directories under a migrating declaration.
 *
 * Writes the product configuration that carries the declaration, a root spec, and a placeholder
 * file in each requested directory, then hands the test a handle that reads the tree through the
 * filesystem source `createFilesystemSpecTreeSource({ productDir })` creates. The harness judges
 * nothing.
 *
 * @module harnesses/spec-tree/migration-classification
 */

import { METHODOLOGY_SECTION } from "@/config/methodology";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  renderSpecTreeRootFrontMatter,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import type { GrammarSelectionDeclaration } from "@testing/harnesses/spec-tree/grammar-selection";
import { withTestEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";

export type MigrationTreeEnv = {
  /** Reads the tree through the filesystem source created for the product directory. */
  read(): Promise<SpecTreeSnapshot>;
};

export async function withMigrationTreeEnv<T>(
  declaration: GrammarSelectionDeclaration,
  tree: { readonly productName: string; readonly directories: readonly string[] },
  callback: (env: MigrationTreeEnv) => Promise<T>,
): Promise<T> {
  return withTestEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await env.writeRaw(
      [SPEC_TREE_CONFIG.ROOT_DIRECTORY, `${tree.productName}${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`].join(
        SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
      ),
      renderSpecTreeRootFrontMatter(),
    );
    for (const directory of tree.directories) await writeOrderedDirectory(env, directory);
    return callback({
      read: () => readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) }),
    });
  });
}
