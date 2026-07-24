/**
 * Pure consumption of the installed methodology package's foundation-resource
 * manifest: shape validation with a schema-version acceptance gate, the core
 * foundation entry, and the extended-resource catalog in manifest order.
 *
 * The installed-package read enters the command handler through an injected
 * reader; every function here operates on supplied text.
 *
 * @module lib/methodology/foundation-manifest
 */

import type { Result } from "@/config/types";

/** Package-relative location of the foundation-resource manifest inside the installed methodology package. */
export const FOUNDATION_MANIFEST_RELATIVE_PATH = "skills/understand/manifest.json";

/** The manifest schema version this consumer accepts; unknown versions fail the projection. */
export const FOUNDATION_MANIFEST_SCHEMA_VERSION = 1;

export const FOUNDATION_MANIFEST_FIELDS = {
  SCHEMA_VERSION: "schema_version",
  CORE: "core",
  REFERENCES: "references",
  TEMPLATES: "templates",
  EXAMPLES: "examples",
} as const;

export const FOUNDATION_MANIFEST_CATALOG_FIELDS = [
  FOUNDATION_MANIFEST_FIELDS.REFERENCES,
  FOUNDATION_MANIFEST_FIELDS.TEMPLATES,
  FOUNDATION_MANIFEST_FIELDS.EXAMPLES,
] as const;

export type FoundationManifestCatalogField = (typeof FOUNDATION_MANIFEST_CATALOG_FIELDS)[number];

/** The validated foundation-resource manifest: one core foundation document plus ordered resource catalogs. */
export interface FoundationResourceManifest {
  readonly schemaVersion: number;
  readonly core: string;
  readonly references: readonly string[];
  readonly templates: readonly string[];
  readonly examples: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A package-relative resource path stays inside the installed package by
 * construction: no absolute form, no backslash semantics, and no empty,
 * current-directory, or parent-directory segment that could traverse above
 * the package root.
 */
function isPackageRelativePath(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validatePathArray(field: string, value: unknown): Result<readonly string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${field} must be an array of non-empty package-relative paths` };
  }
  const offenderIndex = value.findIndex((entry) => typeof entry !== "string" || !isPackageRelativePath(entry));
  if (offenderIndex !== -1) {
    return {
      ok: false,
      error: `${field} must be an array of non-empty package-relative paths; rejected ${
        JSON.stringify(value[offenderIndex])
      }`,
    };
  }
  return { ok: true, value: value as readonly string[] };
}

/**
 * Parses and validates foundation-resource manifest text. An unparseable
 * document, a missing or non-string core entry, a malformed catalog, or a
 * schema version other than the accepted one returns the exact defect so the
 * caller can fail the whole projection naming the resolved manifest path.
 */
export function parseFoundationResourceManifest(text: string): Result<FoundationResourceManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "manifest is not valid JSON" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "manifest must be a JSON object" };
  }
  const schemaVersion = parsed[FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION];
  if (schemaVersion !== FOUNDATION_MANIFEST_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `unsupported ${FOUNDATION_MANIFEST_FIELDS.SCHEMA_VERSION} ${
        JSON.stringify(schemaVersion)
      }; supported: ${FOUNDATION_MANIFEST_SCHEMA_VERSION}`,
    };
  }
  const core = parsed[FOUNDATION_MANIFEST_FIELDS.CORE];
  if (typeof core !== "string" || !isPackageRelativePath(core)) {
    return {
      ok: false,
      error: `${FOUNDATION_MANIFEST_FIELDS.CORE} must be a non-empty package-relative path; rejected ${
        JSON.stringify(core)
      }`,
    };
  }
  const references = validatePathArray(
    FOUNDATION_MANIFEST_FIELDS.REFERENCES,
    parsed[FOUNDATION_MANIFEST_FIELDS.REFERENCES],
  );
  if (!references.ok) return references;
  const templates = validatePathArray(
    FOUNDATION_MANIFEST_FIELDS.TEMPLATES,
    parsed[FOUNDATION_MANIFEST_FIELDS.TEMPLATES],
  );
  if (!templates.ok) return templates;
  const examples = validatePathArray(
    FOUNDATION_MANIFEST_FIELDS.EXAMPLES,
    parsed[FOUNDATION_MANIFEST_FIELDS.EXAMPLES],
  );
  if (!examples.ok) return examples;
  return {
    ok: true,
    value: {
      schemaVersion: FOUNDATION_MANIFEST_SCHEMA_VERSION,
      core,
      references: references.value,
      templates: templates.value,
      examples: examples.value,
    },
  };
}

/** Every extended-resource catalog path in manifest order: references, then templates, then examples. */
export function foundationCatalogPaths(manifest: FoundationResourceManifest): readonly string[] {
  return [...manifest.references, ...manifest.templates, ...manifest.examples];
}

/** Diagnostic for an unreadable or absent foundation-resource manifest; names the resolved path and contract. */
export function formatFoundationManifestUnreadableError(manifestPath: string): string {
  return `Foundation-resource manifest unreadable: ${manifestPath}`
    + ` (expected ${FOUNDATION_MANIFEST_RELATIVE_PATH} in the installed methodology package)`;
}

/** Diagnostic for an invalid foundation-resource manifest; names the resolved path and the exact defect. */
export function formatFoundationManifestInvalidError(manifestPath: string, detail: string): string {
  return `Foundation-resource manifest invalid: ${manifestPath} (${detail})`;
}

/** Diagnostic for a foundation resource the manifest names but the package does not satisfy. */
export function formatFoundationResourceUnreadableError(resourcePath: string, manifestPath: string): string {
  return `Foundation resource unreadable: ${resourcePath} (named by ${manifestPath})`;
}

/** Diagnostic for an understand request with no configured installed methodology package location. */
export function formatFoundationPackageUnconfiguredError(section: string, field: string): string {
  return `Foundation methodology requested but no installed package location is configured; set ${section}.${field}`;
}
