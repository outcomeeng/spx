import { domainPathFilterPredicate } from "./predicates/domain-path-filter";
import { gitTrackingPredicate } from "./predicates/git-tracking";
import type { DomainPathFilterState, GitTrackingState, LayerDecision, LayerEntry, ScopeResolverState } from "./types";

function makeLayer<C>(
  extractState: (state: ScopeResolverState) => C,
  predicate: (path: string, config: C) => LayerDecision,
): LayerEntry {
  return {
    extractState,
    predicate: (path, config) => predicate(path, config as C),
  };
}

export const domainPathFilterLayer: LayerEntry = makeLayer(
  (state): DomainPathFilterState => state.request.domainPathFilter ?? {},
  domainPathFilterPredicate,
);

export const gitTrackingLayer: LayerEntry = makeLayer(
  (state): GitTrackingState => ({ reader: state.ignoreReader }),
  gitTrackingPredicate,
);

export const LAYER_SEQUENCE: readonly LayerEntry[] = [
  domainPathFilterLayer,
  gitTrackingLayer,
];
