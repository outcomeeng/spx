import type { PathFilterConfig } from "@/config/primitives/path-filter";

import type { IgnoreSourceReader } from "./ignore-source";

export type LayerDecision = {
  readonly matched: boolean;
  readonly layer: string;
  readonly detail?: string;
};

export type GitTrackingState = {
  readonly reader: IgnoreSourceReader;
};

export type DomainPathFilterState = PathFilterConfig;

export type ScopeResolverConfig = Record<string, never>;

export type ScopeResolverState = {
  readonly request: ScopeRequest;
  readonly config: ScopeResolverConfig;
  readonly ignoreReader: IgnoreSourceReader;
};

export type ScopeRequest = {
  readonly explicit?: readonly string[];
  readonly walkRoot?: string;
  readonly domainPathFilter?: PathFilterConfig;
  readonly overrides?: IgnoreSourceOverrides;
};

export type ScopeEntry = {
  readonly path: string;
  readonly decisionTrail: readonly LayerDecision[];
};

export type ScopeResult = {
  readonly included: readonly ScopeEntry[];
  readonly excluded: readonly ScopeEntry[];
  readonly appliedOverrides: IgnoreSourceOverrides;
};

export type LayerEntry<C = unknown> = {
  readonly predicate: (path: string, config: C) => LayerDecision;
  readonly extractState: (state: ScopeResolverState) => C;
};

export type AdapterConfig = { readonly ignoreFlag: string };

export type ToolAdaptersConfig = Readonly<Partial<Record<string, AdapterConfig>>>;

export type ToolAdapterFn = (scope: ScopeResult, config: AdapterConfig) => readonly string[];

export type IgnoreSourceOverrides = {
  readonly noIgnore: boolean;
  readonly noIgnoreVcs: boolean;
  readonly ignoreFile: string | undefined;
};
