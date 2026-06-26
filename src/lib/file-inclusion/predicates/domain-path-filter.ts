import type { DomainPathFilterState, LayerDecision } from "../types";

export const DOMAIN_PATH_FILTER_LAYER = "domain-path-filter";
const LAYER = DOMAIN_PATH_FILTER_LAYER;
const PATH_SEGMENT_SEPARATOR = "/";
export const DOMAIN_PATH_FILTER_DETAIL_PREFIX = {
  EXCLUDE: "exclude:",
  INCLUDE: "include:",
} as const;

function normalizePathPrefix(value: string): string {
  return value
    .split(/[\\/]/g)
    .join(PATH_SEGMENT_SEPARATOR)
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
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
