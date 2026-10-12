/**
 * The fields of a product's methodology declaration that a read selects its
 * grammar from, named once for the config module that validates the section and
 * the spec-tree library that selects from it.
 *
 * @module lib/methodology/declaration-fields
 */

export const METHODOLOGY_DECLARATION_FIELDS = {
  SECTION: "methodology",
  VERSION: "version",
  MIGRATING_FROM: "migratingFrom",
} as const;

/** Diagnostic for a methodology selection requested by a product that declares no methodology version. */
export function formatMethodologyDeclarationVersionUndeclaredError(): string {
  return `No methodology version is declared; set ${METHODOLOGY_DECLARATION_FIELDS.SECTION}.${METHODOLOGY_DECLARATION_FIELDS.VERSION}`;
}

/** The section a methodology declaration was once placed under, now rejected wherever the declaration is read. */
export const LEGACY_METHODOLOGY_PLACEMENT_SECTION = "harnessEnvironment";

/** Diagnostic for a field a config section does not recognize. */
export function formatUnrecognizedConfigFieldError(path: string, field: string): string {
  return `${path}.${field} is not a recognized config field`;
}
