import { artifactDirectoryPredicate } from "./predicates/artifact-directory";
import { hiddenPrefixPredicate } from "./predicates/hidden-prefix";
import { ignoreSourcePredicate } from "./predicates/ignore-source";
import type { ArtifactDirectoryConfig, HiddenPrefixConfig, IgnoreSourcePredicateConfig } from "./types";
import type { LayerContext, LayerEntry } from "./types";

export const LAYER_SEQUENCE: readonly LayerEntry[] = [
  {
    predicate: (path, config) => artifactDirectoryPredicate(path, config as ArtifactDirectoryConfig),
    extractConfig: (ctx: LayerContext): ArtifactDirectoryConfig => ({
      artifactDirectories: ctx.config.artifactDirectories,
    }),
  },
  {
    predicate: (path, config) => hiddenPrefixPredicate(path, config as HiddenPrefixConfig),
    extractConfig: (ctx: LayerContext): HiddenPrefixConfig => ({
      hiddenPrefix: ctx.config.hiddenPrefix,
    }),
  },
  {
    predicate: (path, config) => ignoreSourcePredicate(path, config as IgnoreSourcePredicateConfig),
    extractConfig: (ctx: LayerContext): IgnoreSourcePredicateConfig => ({
      reader: ctx.ignoreReader,
    }),
  },
];
