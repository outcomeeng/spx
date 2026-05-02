import type { HiddenPrefixConfig, LayerDecision } from "../types";

export const HIDDEN_PREFIX_DEFAULT = ".";

export const HIDDEN_PREFIX_LAYER = "hidden-prefix";
const LAYER = HIDDEN_PREFIX_LAYER;

export function hiddenPrefixPredicate(path: string, config: HiddenPrefixConfig): LayerDecision {
  const segments = path.split("/");
  const basename = segments[segments.length - 1] ?? "";
  const matched = basename.startsWith(config.hiddenPrefix);
  return { matched, layer: LAYER };
}
