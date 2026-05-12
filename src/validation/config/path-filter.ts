import {
  type ValidationPathConfig,
  type ValidationPathFilterConfig,
  type ValidationPathToolSubsection,
} from "@/validation/config/descriptor";
import type { ScopeConfig } from "@/validation/types";

const PATH_PREFIX_SEPARATOR = "/";
const NO_MATCHING_VALIDATION_PATH_PREFIX = "__spx_no_matching_validation_path__";

function normalizePathPrefix(prefix: string): string {
  return prefix
    .split(/[\\/]/g)
    .join(PATH_PREFIX_SEPARATOR)
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalizedPath = normalizePathPrefix(path);
  const normalizedPrefix = normalizePathPrefix(prefix);
  return normalizedPath === normalizedPrefix
    || normalizedPath.startsWith(`${normalizedPrefix}${PATH_PREFIX_SEPARATOR}`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(values: readonly string[] | undefined): readonly string[] {
  return values?.filter((value) => value.length > 0) ?? [];
}

function intersectIncludes(
  baseInclude: readonly string[] | undefined,
  toolInclude: readonly string[] | undefined,
): readonly string[] | undefined {
  const base = nonEmpty(baseInclude);
  const tool = nonEmpty(toolInclude);
  if (base.length === 0) return tool.length === 0 ? undefined : tool;
  if (tool.length === 0) return base;

  const intersections = base.flatMap((basePrefix) =>
    tool.flatMap((toolPrefix) => {
      if (pathMatchesPrefix(basePrefix, toolPrefix)) return [basePrefix];
      if (pathMatchesPrefix(toolPrefix, basePrefix)) return [toolPrefix];
      return [];
    })
  );

  return intersections.length > 0 ? unique(intersections) : [NO_MATCHING_VALIDATION_PATH_PREFIX];
}

export function validationPathFilterForTool(
  paths: ValidationPathConfig,
  tool: ValidationPathToolSubsection,
): ValidationPathFilterConfig {
  const toolConfig = paths[tool];
  return {
    include: intersectIncludes(paths.include, toolConfig?.include),
    exclude: unique([...nonEmpty(paths.exclude), ...nonEmpty(toolConfig?.exclude)]),
  };
}

export function hasValidationPathFilter(filter: ValidationPathFilterConfig): boolean {
  return nonEmpty(filter.include).length > 0 || nonEmpty(filter.exclude).length > 0;
}

export function pathPassesValidationFilter(path: string, filter: ValidationPathFilterConfig): boolean {
  const include = nonEmpty(filter.include);
  const exclude = nonEmpty(filter.exclude);
  if (include.length > 0 && !include.some((prefix) => pathMatchesPrefix(path, prefix))) {
    return false;
  }
  return !exclude.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function applyValidationPathFilterToScope(
  scopeConfig: ScopeConfig,
  filter: ValidationPathFilterConfig,
): ScopeConfig {
  if (!hasValidationPathFilter(filter)) {
    return scopeConfig;
  }

  const includeFallbacks = nonEmpty(filter.include).filter((include) => include !== NO_MATCHING_VALIDATION_PATH_PREFIX);
  const hasIncludeFilter = includeFallbacks.length > 0;
  const scopedDirectories = scopeConfig.directories.filter((directory) =>
    pathPassesValidationFilter(directory, filter)
  );
  const directories = scopedDirectories.length > 0 ? scopedDirectories : includeFallbacks;
  const scopedFilePatterns = scopeConfig.filePatterns.filter((pattern) => pathPassesValidationFilter(pattern, filter));
  const filePatterns = scopedFilePatterns.length > 0 ? scopedFilePatterns : directories;

  return {
    ...scopeConfig,
    directories,
    filePatterns,
    excludePatterns: unique([...scopeConfig.excludePatterns, ...nonEmpty(filter.exclude)]),
    filteredByValidationPaths: true,
    filteredByValidationPathIncludes: hasIncludeFilter,
  };
}
