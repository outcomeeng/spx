import type { ScopeResult, ToolAdapterFn, ToolAdaptersConfig } from "../types";

import { eslintAdapter } from "./eslint";
import { knipAdapter } from "./knip";
import { markdownlintAdapter } from "./markdownlint";
import { pytestAdapter } from "./pytest";
import { tscAdapter } from "./tsc";
import { vitestAdapter } from "./vitest";

export type { AdapterConfig, ToolAdapterFn, ToolAdaptersConfig } from "../types";

export const TOOL_NAMES = {
  ESLINT: "eslint",
  TSC: "tsc",
  KNIP: "knip",
  MARKDOWNLINT: "markdownlint",
  PYTEST: "pytest",
  VITEST: "vitest",
} as const;

export const TOOL_DEFAULT_FLAGS: Readonly<Record<string, string>> = {
  [TOOL_NAMES.ESLINT]: "--ignore-pattern",
  [TOOL_NAMES.TSC]: "--exclude",
  [TOOL_NAMES.KNIP]: "--exclude",
  [TOOL_NAMES.MARKDOWNLINT]: "--ignore",
  [TOOL_NAMES.PYTEST]: "--ignore",
  [TOOL_NAMES.VITEST]: "--exclude",
};

const ADAPTER_MAP: Readonly<Partial<Record<string, ToolAdapterFn>>> = {
  [TOOL_NAMES.ESLINT]: eslintAdapter,
  [TOOL_NAMES.TSC]: tscAdapter,
  [TOOL_NAMES.KNIP]: knipAdapter,
  [TOOL_NAMES.MARKDOWNLINT]: markdownlintAdapter,
  [TOOL_NAMES.PYTEST]: pytestAdapter,
  [TOOL_NAMES.VITEST]: vitestAdapter,
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
  const adapterConfig = config[toolName];
  if (adapterConfig === undefined) {
    throw new Error(
      `No adapter config for tool "${toolName}". Registered tools: ${REGISTERED_TOOL_NAMES.join(", ")}`,
    );
  }
  return adapter(scope, adapterConfig);
}
