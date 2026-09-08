import { posix } from "node:path";

import type { ConfigDescriptor, Result } from "@/config/types";

export const RELEASE_SECTION = "release";
export const RELEASE_CONFIG_FIELDS = {
  DOCUMENTATION: "documentation",
  PATHS: "paths",
  NOTES: "notes",
  WITHHELD_COMMIT_TYPES: "withheldCommitTypes",
} as const;

export const DEFAULT_RELEASE_DOCUMENTATION_PATHS = ["README.md"] as const;
export const RELEASE_DOCUMENTATION_PATH_SEPARATOR = "/";
export const RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR = "\\";

/**
 * Conventional-commit types whose subjects state no user-visible behavior, so
 * release-notes generation withholds them from the producer and the
 * faithfulness auditor alike. The set is configured because which types a
 * product treats as internal is that product's convention: this one writes
 * `spec` commits that conventional commits does not define.
 */
export const DEFAULT_WITHHELD_COMMIT_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "refactor",
  "spec",
  "style",
  "test",
] as const;

export interface DocumentationSyncConfig {
  readonly paths?: readonly string[];
}

export interface ReleaseNotesPolicyConfig {
  readonly withheldCommitTypes?: readonly string[];
}

export interface ReleaseConfig {
  readonly documentation: DocumentationSyncConfig;
  readonly notes: ReleaseNotesPolicyConfig;
}

export const DEFAULT_RELEASE_CONFIG: ReleaseConfig = {
  documentation: { paths: DEFAULT_RELEASE_DOCUMENTATION_PATHS },
  notes: { withheldCommitTypes: DEFAULT_WITHHELD_COMMIT_TYPES },
};

function validate(value: unknown): Result<ReleaseConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: `${RELEASE_SECTION} section must be an object` };
  }
  const documentation = validateDocumentation(value[RELEASE_CONFIG_FIELDS.DOCUMENTATION]);
  if (!documentation.ok) return documentation;
  const notes = validateNotes(value[RELEASE_CONFIG_FIELDS.NOTES]);
  if (!notes.ok) return notes;
  return { ok: true, value: { documentation: documentation.value, notes: notes.value } };
}

function validateDocumentation(value: unknown): Result<DocumentationSyncConfig> {
  if (value === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG.documentation };
  if (!isRecord(value)) {
    return {
      ok: false,
      error: `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.DOCUMENTATION} must be an object`,
    };
  }
  const paths = value[RELEASE_CONFIG_FIELDS.PATHS];
  if (paths === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG.documentation };
  if (!isNonEmptyUniqueStringArray(paths)) {
    return {
      ok: false,
      error:
        `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.DOCUMENTATION}.${RELEASE_CONFIG_FIELDS.PATHS} must be a non-empty array of unique non-empty strings`,
    };
  }
  return { ok: true, value: { paths } };
}

function validateNotes(value: unknown): Result<ReleaseNotesPolicyConfig> {
  if (value === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG.notes };
  if (!isRecord(value)) {
    return {
      ok: false,
      error: `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.NOTES} must be an object`,
    };
  }
  const withheldCommitTypes = value[RELEASE_CONFIG_FIELDS.WITHHELD_COMMIT_TYPES];
  if (withheldCommitTypes === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG.notes };
  if (!isUniqueStringArray(withheldCommitTypes)) {
    return {
      ok: false,
      error:
        `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.NOTES}.${RELEASE_CONFIG_FIELDS.WITHHELD_COMMIT_TYPES} must be an array of unique non-empty strings`,
    };
  }
  return { ok: true, value: { withheldCommitTypes } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyUniqueStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const pathValues: unknown[] = [...value];
  const paths = pathValues.filter(isNonEmptyString);
  return paths.length === pathValues.length
    && new Set(paths.map(normalizeDocumentationPathIdentity)).size === paths.length;
}

function isUniqueStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  const entries: unknown[] = [...value];
  const types = entries.filter(isNonEmptyString);
  return types.length === entries.length && new Set(types).size === types.length;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeDocumentationPathIdentity(path: string): string {
  return posix.normalize(normalizeDocumentationPathSeparators(path));
}

export function normalizeDocumentationPathSeparators(path: string): string {
  return path.replaceAll(
    RELEASE_DOCUMENTATION_WINDOWS_PATH_SEPARATOR,
    RELEASE_DOCUMENTATION_PATH_SEPARATOR,
  );
}

export const releaseConfigDescriptor: ConfigDescriptor<ReleaseConfig> = {
  section: RELEASE_SECTION,
  defaults: DEFAULT_RELEASE_CONFIG,
  validate,
};
