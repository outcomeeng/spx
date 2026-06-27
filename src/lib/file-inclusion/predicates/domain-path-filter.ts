import type { DomainPathFilterState, LayerDecision } from "../types";

export const DOMAIN_PATH_FILTER_LAYER = "domain-path-filter";
const LAYER = DOMAIN_PATH_FILTER_LAYER;
const PATH_SEGMENT_SEPARATOR = "/";
const CURRENT_DIRECTORY_PREFIX = "./";
export const DOMAIN_PATH_FILTER_DETAIL_PREFIX = {
  EXCLUDE: "exclude:",
  INCLUDE: "include:",
} as const;

function normalizePathPrefix(value: string): string {
  const normalizedSeparatorPath = value.split("\\").join(PATH_SEGMENT_SEPARATOR);
  const relativePath = normalizedSeparatorPath.startsWith(CURRENT_DIRECTORY_PREFIX)
    ? normalizedSeparatorPath.slice(CURRENT_DIRECTORY_PREFIX.length)
    : normalizedSeparatorPath;
  return stripTrailingPathSeparators(relativePath);
}

function stripTrailingPathSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === PATH_SEGMENT_SEPARATOR) {
    end -= 1;
  }
  return value.slice(0, end);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  const normalizedPath = normalizePathPrefix(path);
  const normalizedPrefix = normalizePathPrefix(prefix);
  return normalizedPath === normalizedPrefix
    || normalizedPath.startsWith(`${normalizedPrefix}${PATH_SEGMENT_SEPARATOR}`);
}

export function domainPathFilterPredicate(path: string, state: DomainPathFilterState): LayerDecision {
  const include = state.include?.filter((value) => value.length > 0) ?? [];
  const exclude = state.exclude?.filter((value) => value.length > 0) ?? [];
  const matchedExclude = exclude.find((prefix) => pathMatchesPrefix(path, prefix));
  if (matchedExclude !== undefined) {
    return { matched: true, layer: LAYER, detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.EXCLUDE}${matchedExclude}` };
  }
  if (include.length === 0) {
    return { matched: false, layer: LAYER };
  }
  const matchedInclude = include.find((prefix) => pathMatchesPrefix(path, prefix));
  if (matchedInclude !== undefined) {
    return { matched: false, layer: LAYER };
  }
  return { matched: true, layer: LAYER, detail: `${DOMAIN_PATH_FILTER_DETAIL_PREFIX.INCLUDE}${include.join(",")}` };
}
