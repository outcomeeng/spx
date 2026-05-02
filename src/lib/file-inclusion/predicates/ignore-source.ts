import type { IgnoreSourcePredicateConfig, LayerDecision } from "../types";

export const IGNORE_SOURCE_LAYER = "ignore-source";
const LAYER = IGNORE_SOURCE_LAYER;

export function ignoreSourcePredicate(
  path: string,
  config: IgnoreSourcePredicateConfig,
): LayerDecision {
  if (!config.reader.isUnderIgnoreSource(path)) {
    return { matched: false, layer: LAYER };
  }
  const { specTreeRootSegment } = config;
  const matchedEntry = config.reader.entries().find((entry) =>
    path.startsWith(`${specTreeRootSegment}/${entry.segment}/`)
  );
  return { matched: true, layer: LAYER, detail: matchedEntry?.segment };
}
