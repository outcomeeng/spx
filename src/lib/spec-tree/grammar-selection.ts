import {
  formatMethodologyVersionUndeclaredError,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
} from "@/config/methodology";

import { type NamingSchemaVersion, SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS } from "./config";

/** The methodology fields a read selects its grammar from. */
export const SPEC_TREE_DECLARATION_FIELD = {
  VERSION: `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`,
  MIGRATING_FROM: `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM}`,
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
  if (declaration.version === undefined) throw new Error(formatMethodologyVersionUndeclaredError());
  const declared: NamingSchemaVersion[] = [
    versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.VERSION, declaration.version),
  ];
  if (declaration.migratingFrom !== undefined) {
    declared.push(versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.MIGRATING_FROM, declaration.migratingFrom));
  }
  return { known: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS, selected: [...new Set(declared)] };
}
