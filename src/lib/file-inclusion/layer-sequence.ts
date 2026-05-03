import { artifactDirectoryPredicate } from "./predicates/artifact-directory";
import { hiddenPrefixPredicate } from "./predicates/hidden-prefix";
import { ignoreSourcePredicate } from "./predicates/ignore-source";
import type { ArtifactDirectoryConfig, HiddenPrefixConfig, IgnoreSourcePredicateConfig } from "./types";
import type { LayerContext, LayerDecision, LayerEntry } from "./types";

function makeLayer<C>(
  extractConfig: (ctx: LayerContext) => C,
  predicate: (path: string, config: C) => LayerDecision,
): LayerEntry {
  return {
    extractConfig,
    predicate: (path, config) => predicate(path, config as C),
  };
}

export const artifactDirectoryLayer: LayerEntry = makeLayer(
  (ctx): ArtifactDirectoryConfig => ({ artifactDirectories: ctx.config.artifactDirectories }),
  artifactDirectoryPredicate,
);

export const hiddenPrefixLayer: LayerEntry = makeLayer(
  (ctx): HiddenPrefixConfig => ({ hiddenPrefix: ctx.config.hiddenPrefix }),
  hiddenPrefixPredicate,
);

export const ignoreSourceLayer: LayerEntry = makeLayer(
  (ctx): IgnoreSourcePredicateConfig => ({ reader: ctx.ignoreReader }),
  ignoreSourcePredicate,
);

export const LAYER_SEQUENCE: readonly LayerEntry[] = [
  artifactDirectoryLayer,
  hiddenPrefixLayer,
  ignoreSourceLayer,
];
