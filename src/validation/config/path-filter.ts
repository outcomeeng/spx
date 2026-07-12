import { isAbsolute, relative } from "node:path";

import { normalizePathPrefix, pathMatchesPrefix } from "@/config/primitives/path-filter";
import {
  type ValidationPathConfig,
  type ValidationPathFilterConfig,
  type ValidationPathToolSubsection,
} from "@/validation/config/descriptor";
import type { ScopeConfig } from "@/validation/types";

interface ValidationPathIncludeIntersection {
  readonly include?: readonly string[];
  readonly hasIncludeFilter: boolean;
  readonly noMatches: boolean;
}

type EffectiveValidationPathFilterConfig = ValidationPathFilterConfig & {
  readonly hasIncludeFilter: boolean;
  readonly noMatchingIncludes: boolean;
};

function hasEffectiveValidationPathMetadata(
  filter: ValidationPathFilterConfig,
): filter is EffectiveValidationPathFilterConfig {
  return "hasIncludeFilter" in filter
    && typeof filter.hasIncludeFilter === "boolean"
    && "noMatchingIncludes" in filter
    && typeof filter.noMatchingIncludes === "boolean";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty(values: readonly string[] | undefined): readonly string[] {
  return values?.filter((value) => value.length > 0) ?? [];
}

export function toProductRelativeValidationPath(productDir: string, path: string): string {
  return isAbsolute(path) ? relative(productDir, path) : path;
}

function intersectIncludes(
  baseInclude: readonly string[] | undefined,
  toolInclude: readonly string[] | undefined,
): ValidationPathIncludeIntersection {
  const base = nonEmpty(baseInclude);
  const tool = nonEmpty(toolInclude);
  if (base.length === 0 && tool.length === 0) {
    return { hasIncludeFilter: false, noMatches: false };
  }
  if (base.length === 0) return { include: tool, hasIncludeFilter: true, noMatches: false };
  if (tool.length === 0) return { include: base, hasIncludeFilter: true, noMatches: false };

  const intersections = base.flatMap((basePrefix) =>
    tool.flatMap((toolPrefix) => {
      if (pathMatchesPrefix(basePrefix, toolPrefix)) return [basePrefix];
      if (pathMatchesPrefix(toolPrefix, basePrefix)) return [toolPrefix];
      return [];
    })
  );

  if (intersections.length === 0) {
    return { include: [], hasIncludeFilter: true, noMatches: true };
  }

  return { include: unique(intersections), hasIncludeFilter: true, noMatches: false };
}

export function validationPathFilterForTool(
  paths: ValidationPathConfig,
  tool: ValidationPathToolSubsection,
): EffectiveValidationPathFilterConfig {
  const toolConfig = paths[tool];
  const includeIntersection = intersectIncludes(paths.include, toolConfig?.include);
  return {
    include: includeIntersection.include,
    exclude: unique([...nonEmpty(paths.exclude), ...nonEmpty(toolConfig?.exclude)]),
    hasIncludeFilter: includeIntersection.hasIncludeFilter,
    noMatchingIncludes: includeIntersection.noMatches,
  };
}

export function hasValidationPathFilter(filter: ValidationPathFilterConfig): boolean {
  return (hasEffectiveValidationPathMetadata(filter) && filter.noMatchingIncludes)
    || nonEmpty(filter.include).length > 0
    || nonEmpty(filter.exclude).length > 0;
}

export function validationPathFilterHasNoMatchingIncludes(filter: ValidationPathFilterConfig): boolean {
  return hasEffectiveValidationPathMetadata(filter) && filter.noMatchingIncludes;
}

export function pathPassesValidationFilter(path: string, filter: ValidationPathFilterConfig): boolean {
  if (hasEffectiveValidationPathMetadata(filter) && filter.noMatchingIncludes) {
    return false;
  }
  const include = nonEmpty(filter.include);
  const exclude = nonEmpty(filter.exclude);
  if (include.length > 0 && !include.some((prefix) => pathMatchesPrefix(path, prefix))) {
    return false;
  }
  return !exclude.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function pathIntersectsValidationFilter(path: string, filter: ValidationPathFilterConfig): boolean {
  return validationPathFilterIntersections(path, filter).length > 0;
}

export function validationPathFilterExcludes(filter: ValidationPathFilterConfig): string[] {
  return unique(nonEmpty(filter.exclude).map((prefix) => normalizePathPrefix(prefix)));
}

export function validationPathFilterIntersections(
  path: string,
  filter: ValidationPathFilterConfig,
): string[] {
  if (hasEffectiveValidationPathMetadata(filter) && filter.noMatchingIncludes) {
    return [];
  }
  const normalizedPath = normalizePathPrefix(path);
  const include = nonEmpty(filter.include);
  const exclude = nonEmpty(filter.exclude);
  const candidates = include.length > 0
    ? include.flatMap((prefix) => {
      const normalizedPrefix = normalizePathPrefix(prefix);
      if (pathMatchesPrefix(normalizedPath, normalizedPrefix)) return [normalizedPath];
      if (pathMatchesPrefix(normalizedPrefix, normalizedPath)) return [normalizedPrefix];
      return [];
    })
    : [normalizedPath];
  return unique(candidates).filter((candidate) => !exclude.some((prefix) => pathMatchesPrefix(candidate, prefix)));
}

export function applyValidationPathFilterToScope(
  scopeConfig: ScopeConfig,
  filter: ValidationPathFilterConfig,
): ScopeConfig {
  if (!hasValidationPathFilter(filter)) {
    return scopeConfig;
  }

  const includeFallbacks = nonEmpty(filter.include);
  const hasEffectiveMetadata = hasEffectiveValidationPathMetadata(filter);
  const hasIncludeFilter = hasEffectiveMetadata ? filter.hasIncludeFilter : includeFallbacks.length > 0;
  const scopedDirectories = scopeConfig.directories.filter((directory) =>
    pathPassesValidationFilter(directory, filter)
  );
  const scopedFilePatterns = scopeConfig.filePatterns.filter((pattern) => pathPassesValidationFilter(pattern, filter));
  const includeFallbacksWithinScope = includeFallbacks.filter((include) =>
    scopeConfig.directories.some((directory) => pathMatchesPrefix(include, directory))
  );
  const noMatchingIncludes = (hasEffectiveMetadata && filter.noMatchingIncludes)
    || (hasIncludeFilter && scopedDirectories.length === 0 && scopedFilePatterns.length === 0
      && includeFallbacksWithinScope.length === 0);
  let directories: string[];
  if (noMatchingIncludes) {
    directories = [];
  } else if (scopedDirectories.length > 0) {
    directories = scopedDirectories;
  } else {
    directories = includeFallbacksWithinScope;
  }
  const filePatterns = scopedFilePatterns.length > 0 ? scopedFilePatterns : [...directories];

  return {
    ...scopeConfig,
    directories,
    filePatterns,
    excludePatterns: unique([...scopeConfig.excludePatterns, ...nonEmpty(filter.exclude)]),
    filteredByValidationPaths: true,
    filteredByValidationPathIncludes: hasIncludeFilter,
    filteredByValidationPathNoMatches: noMatchingIncludes,
  };
}
