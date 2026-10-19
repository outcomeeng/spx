/**
 * Harness for reading a product tree whose grammar its methodology declaration selects.
 *
 * Copies an inert fixture tree into a temporary product directory, writes the product
 * configuration that carries the declaration, and hands the test a handle that reads the
 * tree through the filesystem source `createFilesystemSpecTreeSource({ productDir })`
 * creates. The harness returns observations and judges nothing; the linked test states the
 * expected classification of the fixture's names.
 *
 * @module harnesses/spec-tree/grammar-selection
 */

import { cp, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeMethodologyLine,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import type { RepresentativeSpecTreeFixture } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export const GRAMMAR_SELECTION_FIXTURE = {
  FOUR_LINE: "four-line",
  THREE_LINE: "three-line",
  MIGRATING: "migrating",
  TWO_ROOTS: "two-roots",
  ROOT_WITHOUT_KIND: "root-without-kind",
  MALFORMED_ROOT_FRONT_MATTER: "malformed-root-front-matter",
} as const;

export type GrammarSelectionFixture = (typeof GRAMMAR_SELECTION_FIXTURE)[keyof typeof GRAMMAR_SELECTION_FIXTURE];

export const GRAMMAR_SELECTION_DECLARATION_FIELD = {
  VERSION: METHODOLOGY_CONFIG_FIELDS.VERSION,
  MIGRATING_FROM: METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM,
} as const;

export type GrammarSelectionDeclaration = {
  readonly [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: string;
  readonly [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]?: string;
};

export type GrammarSelectionEnv = {
  /** Reads the tree through the filesystem source created for the product directory. */
  read(): Promise<SpecTreeSnapshot>;
  /** The product-relative paths of the files directly under the tree root directory. */
  rootFilePaths(): Promise<readonly string[]>;
};

const FIXTURE_ROOT = resolve(__dirname, "../../fixtures/spec-tree/grammar-selection");
const FIXTURE_TREE_DIRECTORY = "tree";

export async function withGrammarSelectionEnv<T>(
  fixture: GrammarSelectionFixture,
  declaration: GrammarSelectionDeclaration,
  callback: (env: GrammarSelectionEnv) => Promise<T>,
): Promise<T> {
  return withTestEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await cp(join(FIXTURE_ROOT, fixture, FIXTURE_TREE_DIRECTORY), env.productDir, { recursive: true });
    return callback({
      read: () => readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) }),
      rootFilePaths: async () =>
        (await readdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY), { withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => [SPEC_TREE_CONFIG.ROOT_DIRECTORY, entry.name].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)),
    });
  });
}

/**
 * Materializes a generated representative fixture under a methodology declaration on the given
 * line and returns the snapshot the filesystem source created for that directory reads.
 */
export async function readFixtureUnderDeclaredLine(
  line: SpecTreeMethodologyLine,
  fixture: RepresentativeSpecTreeFixture,
): Promise<SpecTreeSnapshot> {
  const declaration: GrammarSelectionDeclaration = { [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: line };
  let snapshot: SpecTreeSnapshot | undefined;
  await withSpecTreeEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await env.materialize();
    snapshot = await env.readFilesystemSnapshot();
  }, { fixture });
  if (snapshot === undefined) throw new Error("Expected the callback to read a snapshot");
  return snapshot;
}
