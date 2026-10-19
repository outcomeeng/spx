/**
 * Generators for the methodology declarations a spec-tree read selects its grammar from.
 *
 * The lines are the ones the spec-tree library declares SPX reads. A declared version is any exact form on a line — the line itself
 * or the line with a drawn patch component.
 *
 * @module generators/spec-tree/grammar-selection
 */

import * as fc from "fast-check";

import { METHODOLOGY_VERSION_FORM } from "@/config/methodology";
import {
  KIND_REGISTRY,
  OUTPUT_KINDS,
  SPEC_TREE_CONFIG,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_METHODOLOGY_LINE,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
  type SpecTreeMethodologyLine,
  type SpecTreeRegistry,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  NAMING_SCHEMA_VERSION_TEST_GENERATOR,
  orderedDirectoryRecord,
  type SelectedVersionScenario,
} from "@testing/generators/spec-tree/naming-schema-version";
import { type RepresentativeSpecTreeFixture, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

/** The output node kinds whose suffix no naming-schema version other than the 4.0 version accepts. */
function fourZeroOnlyOutputKinds(): readonly (typeof OUTPUT_KINDS)[number][] {
  const otherVersionSuffixes = new Set(
    SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS
      .filter((version) => version !== SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION)
      .flatMap(({ nodeSuffixes }) => nodeSuffixes),
  );
  return OUTPUT_KINDS.filter((kind) => !otherVersionSuffixes.has(KIND_REGISTRY[kind].suffix));
}

/** A representative fixture whose nodes all carry an output node kind, a suffix only the 4.0 grammar accepts. */
export function arbitraryOutputKindFixture(registry: SpecTreeRegistry): fc.Arbitrary<RepresentativeSpecTreeFixture> {
  return SPEC_TREE_TEST_GENERATOR.representativeFixture(registry, fc.constantFrom(...fourZeroOnlyOutputKinds()));
}

const GRAMMAR_SELECTION_LINES: readonly string[] = Object.values(SPEC_TREE_METHODOLOGY_LINE);

const VERSION_COMPONENT_MAX = 99;
const VERSION_SEPARATOR = ".";

function versionComponent(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: VERSION_COMPONENT_MAX });
}

/** An exact methodology version on the given line, in either accepted form. */
export function arbitraryVersionOnLine(line: SpecTreeMethodologyLine): fc.Arbitrary<string> {
  return fc.tuple(fc.constantFrom(...Object.values(METHODOLOGY_VERSION_FORM)), versionComponent()).map((
    [form, patch],
  ) => form === METHODOLOGY_VERSION_FORM.LINE ? line : [line, patch].join(VERSION_SEPARATOR));
}

/** An exact methodology version on a line outside the lines SPX reads, in either accepted form. */
export function arbitraryUnsupportedVersion(): fc.Arbitrary<string> {
  return fc.tuple(
    versionComponent(),
    versionComponent(),
    fc.constantFrom(...Object.values(METHODOLOGY_VERSION_FORM)),
    versionComponent(),
  )
    .map(([major, minor, form, patch]) => ({
      line: [major, minor].join(VERSION_SEPARATOR),
      form,
      patch,
    }))
    .filter(({ line }) => !GRAMMAR_SELECTION_LINES.includes(line))
    .map(({ line, form, patch }) =>
      form === METHODOLOGY_VERSION_FORM.LINE ? line : [line, patch].join(VERSION_SEPARATOR)
    );
}

/** The lines SPX reads, as the diagnostic of an unsupported declaration names them. */
export function grammarSelectionLines(): readonly string[] {
  return GRAMMAR_SELECTION_LINES;
}

const MAJOR_COMPONENT_INDEX = 0;
const LINE_COMPONENT_COUNT = 2;
const FOUR_ZERO_LINES: readonly string[] = [SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO];

/** The major component of a dotted version or methodology line. */
export function majorComponent(version: string): string {
  return version.split(VERSION_SEPARATOR)[MAJOR_COMPONENT_INDEX];
}

/** The `MAJOR.MINOR` methodology line of a dotted version or of a line itself. */
export function lineComponent(version: string): string {
  return version.split(VERSION_SEPARATOR).slice(0, LINE_COMPONENT_COUNT).join(VERSION_SEPARATOR);
}

/**
 * A methodology declaration with the major components of the naming-schema versions it selects:
 * a line maps to the naming-schema version of its major, and a 4.0 target with a 3.x migration
 * source selects both.
 */
export type DeclarationSelectionCase = {
  readonly label: string;
  readonly declaration: { readonly version: string; readonly migratingFrom?: string };
  readonly selectedMajors: readonly string[];
};

/** One case per line SPX reads in each accepted version form, and one per 3.x migration source of a 4.0 target. */
export function declarationSelectionCases(): readonly DeclarationSelectionCase[] {
  const single = GRAMMAR_SELECTION_LINES.flatMap((line) => {
    const lineValue = line as SpecTreeMethodologyLine;
    return [
      { label: `line ${line}`, version: line },
      { label: `line ${line} with a patch`, version: sampleGeneratedValue(arbitraryExactVersionOnLine(lineValue)) },
    ].map(({ label, version }) => ({
      label,
      declaration: { version },
      selectedMajors: [majorComponent(line)],
    }));
  });
  const migrating = GRAMMAR_SELECTION_LINES.filter((line) => !FOUR_ZERO_LINES.includes(line)).map((line) => ({
    label: `line ${SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO} with migration source ${line}`,
    declaration: { version: SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO, migratingFrom: line },
    selectedMajors: [majorComponent(SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO), majorComponent(line)],
  }));
  return [...single, ...migrating];
}

function arbitraryExactVersionOnLine(line: SpecTreeMethodologyLine): fc.Arbitrary<string> {
  return versionComponent().map((patch) => [line, patch].join(VERSION_SEPARATOR));
}

const THREE_X_LINES: readonly SpecTreeMethodologyLine[] = [
  SPEC_TREE_METHODOLOGY_LINE.THREE_ZERO,
  SPEC_TREE_METHODOLOGY_LINE.THREE_ONE,
  SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
];

/** A methodology declaration on a line SPX reads, with or without a migration source on a 3.x line. */
export function arbitraryMethodologyDeclaration(): fc.Arbitrary<{
  readonly version: string;
  readonly migratingFrom?: string;
}> {
  const readLines = GRAMMAR_SELECTION_LINES as readonly SpecTreeMethodologyLine[];
  return fc
    .tuple(
      fc.constantFrom(...readLines).chain((line) => arbitraryVersionOnLine(line)),
      fc.option(fc.constantFrom(...THREE_X_LINES).chain((line) => arbitraryVersionOnLine(line)), { nil: undefined }),
    )
    .map(([version, migratingFrom]) => migratingFrom === undefined ? { version } : { version, migratingFrom });
}

/** A node-directory suffix that names a registered kind; the nested-product suffix names none. */
export function arbitraryKnownNodeSuffix(): fc.Arbitrary<string> {
  return fc.constantFrom(
    ...new Set(
      SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS
        .flatMap(({ nodeSuffixes }) => nodeSuffixes)
        .filter((suffix) => suffix !== SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX),
    ),
  );
}

/** A selected version beside known companions, with the node directory its own suffix names. */
export type SelectedVersionDirectoryScenario = SelectedVersionScenario & {
  readonly record: ReturnType<typeof orderedDirectoryRecord>;
};

/** A selected version with its companions and a node directory of the suffix the scenario draws. */
export function arbitrarySelectedVersionDirectoryScenario(): fc.Arbitrary<SelectedVersionDirectoryScenario> {
  return fc
    .tuple(
      NAMING_SCHEMA_VERSION_TEST_GENERATOR.selectedVersionScenario(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
    )
    .map(([scenario, order, slug]) => ({ ...scenario, record: orderedDirectoryRecord(order, slug, scenario.suffix) }));
}

/** A methodology declaration with a node directory named by a suffix some known version accepts. */
export type DeclaredNodeDirectoryScenario = {
  readonly declaration: { readonly version: string; readonly migratingFrom?: string };
  readonly suffix: string;
  readonly record: ReturnType<typeof orderedDirectoryRecord>;
};

export function arbitraryDeclaredNodeDirectoryScenario(): fc.Arbitrary<DeclaredNodeDirectoryScenario> {
  return fc
    .tuple(
      arbitraryMethodologyDeclaration(),
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      arbitraryKnownNodeSuffix(),
    )
    .map(([declaration, order, slug, suffix]) => ({
      declaration,
      suffix,
      record: orderedDirectoryRecord(order, slug, suffix),
    }));
}
