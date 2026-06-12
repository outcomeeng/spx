/**
 * The session-domain APIs the compact domain must not import, keeping stash
 * resolution decoupled from the session-handoff domain per
 * `spx/48-compact.enabler/21-stash-resolution.adr.md`. The single source for the
 * ESLint `no-restricted-imports` enforcement and its compliance test.
 *
 * @module domains/compact/import-boundary
 */

/** The ESLint rule id that enforces the compact import boundary in the pipeline. */
export const COMPACT_IMPORT_BOUNDARY_RULE_ID = "no-restricted-imports";

/** A module path and the named exports from it that compact modules must not import. */
export interface ForbiddenImport {
  readonly module: string;
  readonly names: readonly string[];
}

export const COMPACT_FORBIDDEN_SESSION_IMPORTS: readonly ForbiddenImport[] = [
  { module: "@/git/root", names: ["resolveSessionConfig"] },
  { module: "@/domains/session/show", names: ["SessionDirectoryConfig"] },
] as const;
