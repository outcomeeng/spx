import type { ScopeResult } from "../types";
import type { AdapterConfig, ToolAdapterFn, ToolAdaptersConfig } from "../types";

import { eslintAdapter } from "./eslint";
import { knipAdapter } from "./knip";
import { madgeAdapter } from "./madge";
import { markdownlintAdapter } from "./markdownlint";
import { pytestAdapter } from "./pytest";
import { tscAdapter } from "./tsc";
import { vitestAdapter } from "./vitest";

export type { AdapterConfig, ToolAdapterFn, ToolAdaptersConfig };

export const TOOL_DEFAULT_FLAGS: Readonly<Record<string, string>> = {
  eslint: "--ignore-pattern",
  tsc: "--exclude",
  madge: "--exclude",
  knip: "--exclude",
  markdownlint: "--ignore",
  pytest: "--ignore",
  vitest: "--exclude",
};

const ADAPTER_MAP: Readonly<Record<string, ToolAdapterFn>> = {
  eslint: eslintAdapter,
  tsc: tscAdapter,
  madge: madgeAdapter,
  knip: knipAdapter,
  markdownlint: markdownlintAdapter,
  pytest: pytestAdapter,
  vitest: vitestAdapter,
};

export const REGISTERED_TOOL_NAMES: readonly string[] = Object.keys(ADAPTER_MAP);

export function toToolArguments(
  scope: ScopeResult,
  toolName: string,
  config: ToolAdaptersConfig,
): readonly string[] {
  const adapter = ADAPTER_MAP[toolName];
  if (adapter === undefined) {
    throw new Error(
      `Unknown tool "${toolName}". Registered tools: ${REGISTERED_TOOL_NAMES.join(", ")}`,
    );
  }
  const adapterConfig = config.tools[toolName];
  if (adapterConfig === undefined) {
    throw new Error(
      `No adapter config for tool "${toolName}". Registered tools: ${REGISTERED_TOOL_NAMES.join(", ")}`,
    );
  }
  return adapter(scope, adapterConfig);
}
