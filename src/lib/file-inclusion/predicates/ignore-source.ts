import type { IgnoreSourcePredicateConfig, LayerDecision } from "../types";

export const IGNORE_SOURCE_LAYER = "ignore-source";
const LAYER = IGNORE_SOURCE_LAYER;

export function ignoreSourcePredicate(
  path: string,
  config: IgnoreSourcePredicateConfig,
): LayerDecision {
  const entry = config.reader.matchedEntry(path);
  if (entry === undefined) {
    return { matched: false, layer: LAYER };
  }
  return { matched: true, layer: LAYER, detail: entry.segment };
}
