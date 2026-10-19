import {
  formatMethodologyDeclarationVersionUndeclaredError,
  METHODOLOGY_DECLARATION_FIELDS,
} from "../methodology/declaration-fields";
import {
  canonicalNamingSchemaVersion,
  compareNamingSchemaVersions,
  type NamingSchemaVersion,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
} from "./config";

/** The methodology fields a read selects its grammar from. */
export const SPEC_TREE_DECLARATION_FIELD = {
  VERSION: `${METHODOLOGY_DECLARATION_FIELDS.SECTION}.${METHODOLOGY_DECLARATION_FIELDS.VERSION}`,
  MIGRATING_FROM: `${METHODOLOGY_DECLARATION_FIELDS.SECTION}.${METHODOLOGY_DECLARATION_FIELDS.MIGRATING_FROM}`,
} as const;

export type SpecTreeMethodologyDeclaration = {
  readonly version?: string;
  readonly migratingFrom?: string;
};

/** The grammar a read accepts: the versions it selects among every version SPX knows. */
export type SpecTreeGrammarSelection = {
  readonly known: readonly NamingSchemaVersion[];
  readonly selected: readonly NamingSchemaVersion[];
};

const LINE_LIST_SEPARATOR = ", ";
const LINE_OF_VERSION_PATTERN = /^(\d+\.\d+)(?:\.|$)/;
const LINE_CAPTURE_INDEX = 1;

function lineOf(version: string): string | undefined {
  return LINE_OF_VERSION_PATTERN.exec(version)?.[LINE_CAPTURE_INDEX];
}

function unreadableLineError(field: string, version: string): Error {
  const readLines = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS.flatMap((known) => known.lines);
  return new Error(
    `${field} ${JSON.stringify(version)} is not on a methodology line SPX reads; SPX reads ${
      readLines.join(LINE_LIST_SEPARATOR)
    }`,
  );
}

function versionForDeclaredLine(field: string, version: string): NamingSchemaVersion {
  const line = lineOf(version);
  const serving = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS.find((known) => known.lines.some((served) => served === line));
  if (serving === undefined) throw unreadableLineError(field, version);
  return serving;
}

/**
 * The grammar a methodology declaration selects: the version serving the line of
 * `methodology.version`, and the version serving the line of `methodology.migratingFrom`
 * while a migration source accompanies it. A declaration that names no version throws,
 * naming the missing field. A line no version serves throws, naming the declared version
 * and the lines SPX reads.
 */
export function selectSpecTreeGrammar(declaration: SpecTreeMethodologyDeclaration): SpecTreeGrammarSelection {
  if (declaration.version === undefined) throw new Error(formatMethodologyDeclarationVersionUndeclaredError());
  const declared: NamingSchemaVersion[] = [
    versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.VERSION, declaration.version),
  ];
  if (declaration.migratingFrom !== undefined) {
    declared.push(versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.MIGRATING_FROM, declaration.migratingFrom));
  }
  return { known: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS, selected: [...new Set(declared)] };
}

const VERSION_ORDER_EQUAL = 0;

/**
 * The known versions ordered at or before the selection's declared target that no selected
 * version includes, highest first: the versions whose forms the product has left.
 */
export function priorNamingSchemaVersions(selection: SpecTreeGrammarSelection): readonly NamingSchemaVersion[] {
  const target = canonicalNamingSchemaVersion(selection.selected);
  return selection.known
    .filter((version) =>
      !selection.selected.includes(version) && compareNamingSchemaVersions(version, target) <= VERSION_ORDER_EQUAL
    )
    .sort((left, right) => compareNamingSchemaVersions(right, left));
}

/**
 * The node-directory suffixes a selection leaves behind: the union of the suffixes the versions
 * ordered before the declared target accept, less the suffixes the selected versions accept.
 */
export function selectedSupersededNodeSuffixes(selection: SpecTreeGrammarSelection): readonly string[] {
  const valid = new Set(selection.selected.flatMap((version) => version.nodeSuffixes));
  const superseded = new Set<string>();
  for (const version of priorNamingSchemaVersions(selection)) {
    for (const suffix of version.nodeSuffixes) {
      if (!valid.has(suffix)) superseded.add(suffix);
    }
  }
  return [...superseded];
}
