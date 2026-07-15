import {
  type Agent,
  type AgentMarketplaceConfig,
  type HarnessEnvironmentConfig,
} from "@/domains/agent-environment/config";

export const REQUIRED_PLUGIN_BOOTSTRAP = {
  MARKETPLACE: "outcomeeng",
  PLUGIN: "spec-tree",
} as const;

export const PLUGIN_BOOTSTRAP_DECLARATION_VERDICT = {
  HEALTHY: "healthy",
  BASELINE_MISSING: "baseline-missing",
} as const;

export type PluginBootstrapDeclarationVerdict =
  (typeof PLUGIN_BOOTSTRAP_DECLARATION_VERDICT)[keyof typeof PLUGIN_BOOTSTRAP_DECLARATION_VERDICT];

export interface AgentPluginExpectation {
  readonly agent: Agent;
  readonly marketplace: AgentMarketplaceConfig;
  readonly plugins: readonly string[];
}

export interface PluginBootstrapDeclarationStatus {
  readonly verdict: PluginBootstrapDeclarationVerdict;
  readonly missingBaseline: readonly Agent[];
  readonly expectations: readonly AgentPluginExpectation[];
  readonly claudeOnly: readonly string[];
  readonly codexOnly: readonly string[];
}

const CLASSIFIER_PENDING_ERROR = "plugin bootstrap declaration classifier is pending implementation";

export function classifyPluginBootstrapDeclarations(
  _config: HarnessEnvironmentConfig,
): PluginBootstrapDeclarationStatus {
  throw new Error(CLASSIFIER_PENDING_ERROR);
}
