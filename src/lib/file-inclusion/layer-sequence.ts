import type { IgnoreSourceReader } from "./ignore-source";
import { artifactDirectoryPredicate } from "./predicates/artifact-directory";
import { hiddenPrefixPredicate } from "./predicates/hidden-prefix";
import { ignoreSourcePredicate } from "./predicates/ignore-source";
import type { LayerEntry, ScopeResolverConfig } from "./types";
import type { ArtifactDirectoryConfig, HiddenPrefixConfig, IgnoreSourcePredicateConfig } from "./types";

type AugmentedConfig = ScopeResolverConfig & { readonly _ignoreReader?: IgnoreSourceReader };

const STUB_IGNORE_READER: IgnoreSourceReader = {
  isUnderIgnoreSource: () => false,
  entries: () => [],
};

export const LAYER_SEQUENCE: readonly LayerEntry[] = [
  {
    predicate: (path, config) => artifactDirectoryPredicate(path, config as ArtifactDirectoryConfig),
    extractConfig: (r: ScopeResolverConfig): ArtifactDirectoryConfig => ({
      artifactDirectories: r.artifactDirectories,
    }),
  },
  {
    predicate: (path, config) => hiddenPrefixPredicate(path, config as HiddenPrefixConfig),
    extractConfig: (r: ScopeResolverConfig): HiddenPrefixConfig => ({
      hiddenPrefix: r.hiddenPrefix,
    }),
  },
  {
    predicate: (path, config) => ignoreSourcePredicate(path, config as IgnoreSourcePredicateConfig),
    extractConfig: (r: ScopeResolverConfig): IgnoreSourcePredicateConfig => ({
      reader: (r as AugmentedConfig)._ignoreReader ?? STUB_IGNORE_READER,
      specTreeRootSegment: r.specTreeRootSegment,
    }),
  },
];
