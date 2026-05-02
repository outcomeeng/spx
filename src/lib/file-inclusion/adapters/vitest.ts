import type { AdapterConfig, ScopeResult } from "../types";

export function vitestAdapter(scope: ScopeResult, config: AdapterConfig): readonly string[] {
  return scope.excluded.flatMap((entry) => [config.ignoreFlag, entry.path]);
}
