import {
  canonicalNamingSchemaVersion,
  type NamingSchemaVersion,
  SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_NAMING_SCHEMA_VERSIONS,
  SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION,
} from "./config";

/** The methodology lines SPX reads, each as `MAJOR.MINOR`. */
export const SPEC_TREE_METHODOLOGY_LINE = {
  THREE_ZERO: "3.0",
  THREE_ONE: "3.1",
  THREE_TWO: "3.2",
  FOUR_ZERO: "4.0",
} as const;

export type SpecTreeMethodologyLine = (typeof SPEC_TREE_METHODOLOGY_LINE)[keyof typeof SPEC_TREE_METHODOLOGY_LINE];

/** The methodology fields a read selects its grammar from. */
export const SPEC_TREE_DECLARATION_FIELD = {
  VERSION: "methodology.version",
  MIGRATING_FROM: "methodology.migratingFrom",
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

const THREE_X_LINES: readonly string[] = [
  SPEC_TREE_METHODOLOGY_LINE.THREE_ZERO,
  SPEC_TREE_METHODOLOGY_LINE.THREE_ONE,
  SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
];

function lineOf(version: string): string | undefined {
  return LINE_OF_VERSION_PATTERN.exec(version)?.[LINE_CAPTURE_INDEX];
}

function unreadableLineError(field: string, version: string): Error {
  return new Error(
    `${field} ${JSON.stringify(version)} is not on a methodology line SPX reads; SPX reads ${
      Object.values(SPEC_TREE_METHODOLOGY_LINE).join(LINE_LIST_SEPARATOR)
    }`,
  );
}

function versionForDeclaredLine(field: string, version: string): NamingSchemaVersion {
  const line = lineOf(version);
  if (line === SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO) return SPEC_TREE_OUTPUT_NAMING_SCHEMA_VERSION;
  if (line !== undefined && THREE_X_LINES.includes(line)) {
    return canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS);
  }
  throw unreadableLineError(field, version);
}

/**
 * The grammar a methodology declaration selects: the 4.0 grammar for a version on the 4.0
 * line, the 3.x grammar for a version on the 3.0, 3.1, or 3.2 line, and both while a
 * migration source on one of those lines accompanies the version. A declaration that names
 * no version selects the 3.x grammar. A line outside those SPX reads throws, naming the
 * declared version and the lines SPX reads.
 */
export function selectSpecTreeGrammar(declaration: SpecTreeMethodologyDeclaration): SpecTreeGrammarSelection {
  const declared: NamingSchemaVersion[] = [];
  if (declaration.version !== undefined) {
    declared.push(versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.VERSION, declaration.version));
  }
  if (declaration.migratingFrom !== undefined) {
    declared.push(versionForDeclaredLine(SPEC_TREE_DECLARATION_FIELD.MIGRATING_FROM, declaration.migratingFrom));
  }
  const selected = declared.length === 0
    ? [canonicalNamingSchemaVersion(SPEC_TREE_NAMING_SCHEMA_VERSIONS)]
    : [...new Set(declared)];
  return { known: SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS, selected };
}
