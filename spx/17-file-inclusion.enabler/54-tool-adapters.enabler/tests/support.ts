import type { AdapterConfig, ToolAdaptersConfig } from "@/lib/file-inclusion/adapters";
import type { ScopeResult } from "@/lib/file-inclusion/types";

export const sampleExcludedPath = "src/example.ts";
export const testAdapterFlag = "--test-ignore";
export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export function makeScope(
  excludedPaths: readonly string[] = [],
  includedPaths: readonly string[] = [],
): ScopeResult {
  return {
    included: includedPaths.map((path) => ({ path, decisionTrail: [] })),
    excluded: excludedPaths.map((path) => ({ path, decisionTrail: [] })),
  };
}

export function makeAdapterConfig(ignoreFlag: string): AdapterConfig {
  return { ignoreFlag };
}

export function makeToolAdaptersConfig(
  tools: Readonly<Record<string, string>>,
): ToolAdaptersConfig {
  return {
    tools: Object.fromEntries(
      Object.entries(tools).map(([name, flag]) => [name, makeAdapterConfig(flag)]),
    ),
  };
}
