/**
 * Harness for reading a product tree whose grammar its methodology declaration selects.
 *
 * Copies an inert fixture tree into a temporary product directory, writes the product
 * configuration that carries the declaration, and hands the test a handle that reads the
 * tree through the filesystem source `createFilesystemSpecTreeSource({ productDir })`
 * creates. The fixture's `expected.json` is the hand-authored classification of its
 * directories and root file; the harness returns it as an observation and judges nothing.
 *
 * @module harnesses/spec-tree/grammar-selection
 */

import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export const GRAMMAR_SELECTION_FIXTURE = {
  FOUR_LINE: "four-line",
  THREE_LINE: "three-line",
  MIGRATING: "migrating",
  TWO_ROOTS: "two-roots",
  ROOT_WITHOUT_KIND: "root-without-kind",
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

/** The fixture author's classification of the fixture's names. */
export type GrammarSelectionExpectation = {
  readonly product: string;
  readonly valid: readonly string[];
  readonly superseded: readonly string[];
  readonly invalid: readonly string[];
};

export type GrammarSelectionEnv = {
  /** Reads the tree through the filesystem source created for the product directory. */
  read(): Promise<SpecTreeSnapshot>;
  /** The fixture's expectation, read from its `expected.json`. */
  expectation(): Promise<GrammarSelectionExpectation>;
  /** The product-relative paths of the files directly under the tree root directory. */
  rootFilePaths(): Promise<readonly string[]>;
};

const FIXTURE_ROOT = resolve(__dirname, "../../fixtures/spec-tree/grammar-selection");
const FIXTURE_TREE_DIRECTORY = "tree";
const FIXTURE_EXPECTATION_FILE = "expected.json";
const FIXTURE_ENCODING = "utf8";

export type GrammarSelectionOptions = {
  /** Text that replaces the content of every file directly under the tree root directory after the fixture is copied. */
  readonly rootFileText?: string;
};

export async function withGrammarSelectionEnv<T>(
  fixture: GrammarSelectionFixture,
  declaration: GrammarSelectionDeclaration,
  callback: (env: GrammarSelectionEnv) => Promise<T>,
  options: GrammarSelectionOptions = {},
): Promise<T> {
  return withTestEnv({ [METHODOLOGY_SECTION]: declaration }, async (env) => {
    await cp(join(FIXTURE_ROOT, fixture, FIXTURE_TREE_DIRECTORY), env.productDir, { recursive: true });
    if (options.rootFileText !== undefined) {
      const rootDirectory = join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
      for (const entry of await readdir(rootDirectory, { withFileTypes: true })) {
        if (entry.isFile()) await writeFile(join(rootDirectory, entry.name), options.rootFileText, FIXTURE_ENCODING);
      }
    }
    return callback({
      read: () => readSpecTree({ source: createFilesystemSpecTreeSource({ productDir: env.productDir }) }),
      expectation: async () =>
        JSON.parse(await readFile(join(FIXTURE_ROOT, fixture, FIXTURE_EXPECTATION_FILE), FIXTURE_ENCODING)),
      rootFilePaths: async () =>
        (await readdir(join(env.productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY), { withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => [SPEC_TREE_CONFIG.ROOT_DIRECTORY, entry.name].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR)),
    });
  });
}
