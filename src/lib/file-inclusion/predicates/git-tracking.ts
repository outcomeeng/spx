import type { GitTrackingState, LayerDecision } from "../types";

export const GIT_TRACKING_LAYER = "git-tracking";
const LAYER = GIT_TRACKING_LAYER;

export function gitTrackingPredicate(
  path: string,
  state: GitTrackingState,
): LayerDecision {
  if (state.reader.isInIncludedSet(path)) {
    return { matched: false, layer: LAYER };
  }
  return { matched: true, layer: LAYER };
}
