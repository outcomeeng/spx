import type { Result } from "@/config/types";

export const PATH_FILTER_CONFIG_FIELDS = {
  INCLUDE: "include",
  EXCLUDE: "exclude",
} as const;

export interface PathFilterConfig {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
}

export function validatePathFilterConfig(raw: unknown, path: string): Result<PathFilterConfig> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: `${path} must be an object`,
    };
  }
  const candidate = raw as Record<string, unknown>;

  const include = candidate[PATH_FILTER_CONFIG_FIELDS.INCLUDE];
  if (
    include !== undefined
    && (!Array.isArray(include) || !include.every((value) => typeof value === "string"))
  ) {
    return {
      ok: false,
      error: `${path}.${PATH_FILTER_CONFIG_FIELDS.INCLUDE} must be an array of strings`,
    };
  }

  const exclude = candidate[PATH_FILTER_CONFIG_FIELDS.EXCLUDE];
  if (
    exclude !== undefined
    && (!Array.isArray(exclude) || !exclude.every((value) => typeof value === "string"))
  ) {
    return {
      ok: false,
      error: `${path}.${PATH_FILTER_CONFIG_FIELDS.EXCLUDE} must be an array of strings`,
    };
  }

  const value: {
    include?: readonly string[];
    exclude?: readonly string[];
  } = {};
  if (include !== undefined) value.include = include as readonly string[];
  if (exclude !== undefined) value.exclude = exclude as readonly string[];

  return { ok: true, value };
}

const PATH_SEGMENT_SEPARATOR = "/";

function normalizePathPrefix(value: string): string {
  return value.replace(/\/+$/, "");
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalizedPath = normalizePathPrefix(path);
  const normalizedPrefix = normalizePathPrefix(prefix);
  return normalizedPath === normalizedPrefix
    || normalizedPath.startsWith(`${normalizedPrefix}${PATH_SEGMENT_SEPARATOR}`);
}

/**
 * Keeps the paths a filter admits: a path survives when the include set is empty
 * or some include prefix matches it, and no exclude prefix matches it. A prefix
 * matches a path by exact equality or at a path-segment boundary, never by shared
 * leading text alone.
 */
export function applyPathFilter(
  paths: readonly string[],
  config: PathFilterConfig,
): readonly string[] {
  const includePrefixes = config.include ?? [];
  const excludePrefixes = config.exclude ?? [];
  return paths.filter((path) => {
    if (includePrefixes.length > 0 && !includePrefixes.some((prefix) => pathMatchesPrefix(path, prefix))) {
      return false;
    }
    return !excludePrefixes.some((prefix) => pathMatchesPrefix(path, prefix));
  });
}
