import {
  AGENT,
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

export const PLUGIN_BOOTSTRAP_AGENT_ORDER = [AGENT.CLAUDE_CODE, AGENT.CODEX] as const;

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

function configuredExpectation(
  config: HarnessEnvironmentConfig,
  agent: Agent,
): AgentPluginExpectation | undefined {
  const marketplace = config.pluginBootstrap.marketplaces.find((entry) =>
    entry.agent === agent && entry.name === REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE
  );
  if (marketplace === undefined) return undefined;
  return {
    agent,
    marketplace,
    plugins: config.pluginBootstrap.plugins
      .filter((entry) => entry.agent === agent && entry.marketplace === REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE)
      .map((entry) => entry.name),
  };
}

function difference(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export function classifyPluginBootstrapDeclarations(
  config: HarnessEnvironmentConfig,
): PluginBootstrapDeclarationStatus {
  const enabledAgents = PLUGIN_BOOTSTRAP_AGENT_ORDER.filter((agent) => config.agents[agent].enabled);
  const expectations = enabledAgents.flatMap((agent) => {
    const expectation = configuredExpectation(config, agent);
    return expectation === undefined ? [] : [expectation];
  });
  const missingBaseline = enabledAgents.filter((agent) => {
    const expectation = expectations.find((candidate) => candidate.agent === agent);
    return expectation === undefined || !expectation.plugins.includes(REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN);
  });
  const claude = expectations.find((expectation) => expectation.agent === AGENT.CLAUDE_CODE);
  const codex = expectations.find((expectation) => expectation.agent === AGENT.CODEX);
  return {
    verdict: missingBaseline.length === 0
      ? PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY
      : PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.BASELINE_MISSING,
    missingBaseline,
    expectations,
    claudeOnly: claude === undefined || codex === undefined ? [] : difference(claude.plugins, codex.plugins),
    codexOnly: claude === undefined || codex === undefined ? [] : difference(codex.plugins, claude.plugins),
  };
}
