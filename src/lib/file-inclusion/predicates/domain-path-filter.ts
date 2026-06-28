import { pathMatchesPrefix } from "@/config/primitives/path-filter";

import type { DomainPathFilterState, LayerDecision } from "../types";

export const DOMAIN_PATH_FILTER_LAYER = "domain-path-filter";
const LAYER = DOMAIN_PATH_FILTER_LAYER;
export const DOMAIN_PATH_FILTER_ROOT_PREFIX = ".";
export const DOMAIN_PATH_FILTER_DETAIL_PREFIX = {
  EXCLUDE: "exclude:",
  INCLUDE: "include:",
} as const;

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
