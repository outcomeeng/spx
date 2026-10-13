/**
 * Generators for the node directories a migrating declaration classifies.
 *
 * A migrating declaration names a 4.0 target and a 3.2 migration source. A directory of the
 * migration-source version carries a 3.x kind suffix, one of the target version carries a 4.0
 * kind suffix, and one of neither carries a suffix no version of the grammar registers.
 *
 * @module generators/spec-tree/migration-classification
 */

import * as fc from "fast-check";

import {
  KIND_REGISTRY,
  OUTPUT_KINDS,
  selectSpecTreeGrammar,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeRecognitionOptions,
} from "@/lib/spec-tree";
import { orderedDirectoryRecord } from "@testing/generators/spec-tree/naming-schema-version";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  GRAMMAR_SELECTION_DECLARATION_FIELD,
  type GrammarSelectionDeclaration,
} from "@testing/harnesses/spec-tree/grammar-selection";

/** The declaration under test: a 4.0 target with a 3.2 migration source. */
export const MIGRATING_DECLARATION: GrammarSelectionDeclaration = {
  [GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION]: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO,
  [GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM]: SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
};

const MIGRATION_SOURCE_KINDS = [KIND_REGISTRY.enabler, KIND_REGISTRY.outcome];

export type MigrationClassificationCase = {
  /** The recognition options of the grammar the migrating declaration selects. */
  readonly options: SpecTreeRecognitionOptions;
  /** A node directory name of the migration-source version. */
  readonly sourceDirectory: string;
  /** A node directory name of the target version. */
  readonly targetDirectory: string;
  /** A node directory name of neither version. */
  readonly neitherDirectory: string;
};

export type MigrationTreeLayout = {
  readonly productName: string;
  /** Product-relative directories under `spx/`, parents before their children. */
  readonly directories: readonly string[];
  /** A migration-source directory and the target-version directory it holds. */
  readonly sourceParent: string;
  readonly targetChild: string;
  /** A target-version directory and the migration-source directory it holds. */
  readonly targetParent: string;
  readonly sourceChild: string;
  /** A directory of neither version. */
  readonly neither: string;
};

function arbitraryNeitherSuffix(options: SpecTreeRecognitionOptions): fc.Arbitrary<string> {
  const registered = new Set<string>([
    ...Object.values(KIND_REGISTRY).map((definition) => definition.suffix),
    ...SPEC_TREE_GRAMMAR.PRIOR_NODE_SUFFIXES,
    SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX,
    ...options.schemaVersions.flatMap((version) => version.nodeSuffixes),
  ]);
  return SPEC_TREE_TEST_GENERATOR.unregisteredNodeSuffix(KIND_REGISTRY).filter((suffix) => !registered.has(suffix));
}

function arbitraryDirectoryName(suffix: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(SPEC_TREE_TEST_GENERATOR.filesystemOrder(), SPEC_TREE_TEST_GENERATOR.sourceSlug(), suffix)
    .map(([order, slug, nodeSuffix]) => orderedDirectoryRecord(order, slug, nodeSuffix).relativePath);
}

function arbitrarySourceSuffix(): fc.Arbitrary<string> {
  return fc.constantFrom(...MIGRATION_SOURCE_KINDS.map((definition) => definition.suffix));
}

function arbitraryTargetSuffix(): fc.Arbitrary<string> {
  return fc.constantFrom(...OUTPUT_KINDS.map((kind) => KIND_REGISTRY[kind].suffix));
}

export function arbitraryMigrationClassificationCase(): fc.Arbitrary<MigrationClassificationCase> {
  const selection = selectSpecTreeGrammar({
    version: MIGRATING_DECLARATION[GRAMMAR_SELECTION_DECLARATION_FIELD.VERSION],
    migratingFrom: MIGRATING_DECLARATION[GRAMMAR_SELECTION_DECLARATION_FIELD.MIGRATING_FROM],
  });
  const options: SpecTreeRecognitionOptions = { schemaVersions: selection.known, selectedVersions: selection.selected };
  return fc
    .tuple(
      arbitraryDirectoryName(arbitrarySourceSuffix()),
      arbitraryDirectoryName(arbitraryTargetSuffix()),
      arbitraryDirectoryName(arbitraryNeitherSuffix(options)),
    )
    .map(([sourceDirectory, targetDirectory, neitherDirectory]) => ({
      options,
      sourceDirectory,
      targetDirectory,
      neitherDirectory,
    }));
}

export function arbitraryMigrationTreeLayout(): fc.Arbitrary<MigrationTreeLayout> {
  return fc
    .tuple(
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      arbitraryMigrationClassificationCase(),
      arbitraryMigrationClassificationCase(),
    )
    .map(([productName, first, second]) => {
      const sourceParent = first.sourceDirectory;
      const targetChild = [sourceParent, second.targetDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
      const targetParent = first.targetDirectory;
      const sourceChild = [targetParent, second.sourceDirectory].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
      return {
        productName,
        directories: [sourceParent, targetChild, targetParent, sourceChild, first.neitherDirectory],
        sourceParent,
        targetChild,
        targetParent,
        sourceChild,
        neither: first.neitherDirectory,
      };
    });
}
