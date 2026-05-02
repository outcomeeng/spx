import type { IgnoreSourceReader } from "./ignore-source";

export type LayerDecision = {
  readonly matched: boolean;
  readonly layer: string;
  readonly detail?: string;
};

export type ArtifactDirectoryConfig = {
  readonly artifactDirectories: readonly string[];
};

export type HiddenPrefixConfig = {
  readonly hiddenPrefix: string;
};

export type IgnoreSourcePredicateConfig = {
  readonly reader: IgnoreSourceReader;
};

export type ScopeResolverConfig = {
  readonly artifactDirectories: readonly string[];
  readonly hiddenPrefix: string;
  readonly ignoreSourceFilename: string;
  readonly specTreeRootSegment: string;
};

export type LayerContext = {
  readonly config: ScopeResolverConfig;
  readonly ignoreReader: IgnoreSourceReader;
};

export type ScopeRequest = {
  readonly explicit?: readonly string[];
  readonly walkRoot?: string;
};

export type ScopeEntry = {
  readonly path: string;
  readonly decisionTrail: readonly LayerDecision[];
};

export type ScopeResult = {
  readonly included: readonly ScopeEntry[];
  readonly excluded: readonly ScopeEntry[];
};

export type LayerEntry = {
  readonly predicate: (path: string, config: unknown) => LayerDecision;
  readonly extractConfig: (ctx: LayerContext) => unknown;
};

export type AdapterConfig = { readonly ignoreFlag: string };

export type ToolAdaptersConfig = {
  readonly tools: Readonly<Record<string, AdapterConfig>>;
};

export type ToolAdapterFn = (scope: ScopeResult, config: AdapterConfig) => readonly string[];
