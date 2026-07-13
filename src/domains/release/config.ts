import type { ConfigDescriptor, Result } from "@/config/types";

export const RELEASE_SECTION = "release";
export const RELEASE_CONFIG_FIELDS = {
  DOCUMENTATION: "documentation",
  PATHS: "paths",
} as const;

export const DEFAULT_RELEASE_DOCUMENTATION_PATHS = ["README.md"] as const;

export interface DocumentationSyncConfig {
  readonly paths?: readonly string[];
}

export interface ReleaseConfig {
  readonly documentation: DocumentationSyncConfig;
}

export const DEFAULT_RELEASE_CONFIG: ReleaseConfig = {
  documentation: { paths: DEFAULT_RELEASE_DOCUMENTATION_PATHS },
};

function validate(value: unknown): Result<ReleaseConfig> {
  if (!isRecord(value)) {
    return { ok: false, error: `${RELEASE_SECTION} section must be an object` };
  }
  const documentation = value[RELEASE_CONFIG_FIELDS.DOCUMENTATION];
  if (documentation === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG };
  if (!isRecord(documentation)) {
    return {
      ok: false,
      error: `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.DOCUMENTATION} must be an object`,
    };
  }
  const paths = documentation[RELEASE_CONFIG_FIELDS.PATHS];
  if (paths === undefined) return { ok: true, value: DEFAULT_RELEASE_CONFIG };
  if (!isNonEmptyUniqueStringArray(paths)) {
    return {
      ok: false,
      error:
        `${RELEASE_SECTION}.${RELEASE_CONFIG_FIELDS.DOCUMENTATION}.${RELEASE_CONFIG_FIELDS.PATHS} must be a non-empty array of unique non-empty strings`,
    };
  }
  return { ok: true, value: { documentation: { paths } } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyUniqueStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((path) => typeof path === "string" && path.trim().length > 0)
    && new Set(value).size === value.length;
}

export const releaseConfigDescriptor: ConfigDescriptor<ReleaseConfig> = {
  section: RELEASE_SECTION,
  defaults: DEFAULT_RELEASE_CONFIG,
  validate,
};
