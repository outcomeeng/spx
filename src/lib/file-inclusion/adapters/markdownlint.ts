import type { AdapterConfig, ScopeResult } from "../types";

export function markdownlintAdapter(scope: ScopeResult, config: AdapterConfig): readonly string[] {
  return scope.excluded.flatMap((entry) => [config.ignoreFlag, entry.path]);
}
