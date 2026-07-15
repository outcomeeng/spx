import fc from "fast-check";

import {
  AGENT,
  DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
  type Agent,
  type AgentMarketplaceConfig,
  type AgentPluginConfig,
  type HarnessEnvironmentConfig,
} from "@/domains/agent-environment/config";
import {
  PLUGIN_BOOTSTRAP_DECLARATION_VERDICT,
  REQUIRED_PLUGIN_BOOTSTRAP,
  type PluginBootstrapDeclarationStatus,
} from "@/domains/agent-environment/plugin-bootstrap-status";
import {
  arbitraryMarketplaceSource,
  arbitraryNameToken,
  sampleDiagnoseTestValue,
} from "@testing/generators/diagnose/manifest";

export interface PluginBootstrapMappingCase {
  readonly absentCatalogPlugin: string;
  readonly config: HarnessEnvironmentConfig;
  readonly expected: PluginBootstrapDeclarationStatus;
  readonly title: string;
}

interface PluginBootstrapScenario {
  readonly catalogOnlyPlugin: string;
  readonly claudeOnlyPlugin: string;
  readonly codexOnlyPlugin: string;
  readonly marketplaceSource: string;
}

function marketplace(agent: Agent, source: string): AgentMarketplaceConfig {
  return { agent, name: REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE, source };
}

function plugin(agent: Agent, name: string): AgentPluginConfig {
  return { agent, name, marketplace: REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE };
}

function config(
  marketplaces: readonly AgentMarketplaceConfig[],
  plugins: readonly AgentPluginConfig[],
  disabled: readonly Agent[] = [],
): HarnessEnvironmentConfig {
  return {
    ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
    agents: {
      [AGENT.CLAUDE_CODE]: {
        ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents[AGENT.CLAUDE_CODE],
        enabled: !disabled.includes(AGENT.CLAUDE_CODE),
      },
      [AGENT.CODEX]: {
        ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents[AGENT.CODEX],
        enabled: !disabled.includes(AGENT.CODEX),
      },
    },
    pluginBootstrap: { marketplaces, plugins, skills: [] },
  };
}

function expectation(
  agent: Agent,
  source: string,
  plugins: readonly string[],
): PluginBootstrapDeclarationStatus["expectations"][number] {
  return {
    agent,
    marketplace: marketplace(agent, source),
    plugins,
  };
}

function scenario(): PluginBootstrapScenario {
  return sampleDiagnoseTestValue(
    fc.record({
      catalogOnlyPlugin: arbitraryNameToken(),
      claudeOnlyPlugin: arbitraryNameToken(),
      codexOnlyPlugin: arbitraryNameToken(),
      marketplaceSource: arbitraryMarketplaceSource(),
    }).filter(({ catalogOnlyPlugin, claudeOnlyPlugin, codexOnlyPlugin }) =>
      new Set([
        catalogOnlyPlugin,
        claudeOnlyPlugin,
        codexOnlyPlugin,
        REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN,
      ]).size === 4
    ),
  );
}

export function pluginBootstrapMappingCases(): readonly PluginBootstrapMappingCase[] {
  const generated = scenario();
  const bothMarketplaces = [
    marketplace(AGENT.CLAUDE_CODE, generated.marketplaceSource),
    marketplace(AGENT.CODEX, generated.marketplaceSource),
  ];
  const bothBaselines = [
    plugin(AGENT.CLAUDE_CODE, REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN),
    plugin(AGENT.CODEX, REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN),
  ];
  return [
    {
      title: "both enabled agents declare the required baseline",
      absentCatalogPlugin: generated.catalogOnlyPlugin,
      config: config(bothMarketplaces, bothBaselines),
      expected: {
        verdict: PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY,
        missingBaseline: [],
        expectations: [
          expectation(AGENT.CLAUDE_CODE, generated.marketplaceSource, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
          expectation(AGENT.CODEX, generated.marketplaceSource, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
        ],
        claudeOnly: [],
        codexOnly: [],
      },
    },
    {
      title: "agent-specific configured plugins remain informational differences",
      absentCatalogPlugin: generated.catalogOnlyPlugin,
      config: config(bothMarketplaces, [
        ...bothBaselines,
        plugin(AGENT.CLAUDE_CODE, generated.claudeOnlyPlugin),
        plugin(AGENT.CODEX, generated.codexOnlyPlugin),
      ]),
      expected: {
        verdict: PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY,
        missingBaseline: [],
        expectations: [
          expectation(AGENT.CLAUDE_CODE, generated.marketplaceSource, [
            REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN,
            generated.claudeOnlyPlugin,
          ]),
          expectation(AGENT.CODEX, generated.marketplaceSource, [
            REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN,
            generated.codexOnlyPlugin,
          ]),
        ],
        claudeOnly: [generated.claudeOnlyPlugin],
        codexOnly: [generated.codexOnlyPlugin],
      },
    },
    {
      title: "an enabled agent missing the required marketplace is broken",
      absentCatalogPlugin: generated.catalogOnlyPlugin,
      config: config(
        [marketplace(AGENT.CODEX, generated.marketplaceSource)],
        [plugin(AGENT.CODEX, REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN)],
      ),
      expected: {
        verdict: PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.BASELINE_MISSING,
        missingBaseline: [AGENT.CLAUDE_CODE],
        expectations: [
          expectation(AGENT.CODEX, generated.marketplaceSource, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
        ],
        claudeOnly: [],
        codexOnly: [],
      },
    },
    {
      title: "an enabled agent missing spec-tree is broken",
      absentCatalogPlugin: generated.catalogOnlyPlugin,
      config: config(bothMarketplaces, [plugin(AGENT.CLAUDE_CODE, REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN)]),
      expected: {
        verdict: PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.BASELINE_MISSING,
        missingBaseline: [AGENT.CODEX],
        expectations: [
          expectation(AGENT.CLAUDE_CODE, generated.marketplaceSource, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
          expectation(AGENT.CODEX, generated.marketplaceSource, []),
        ],
        claudeOnly: [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN],
        codexOnly: [],
      },
    },
    {
      title: "a disabled agent does not participate",
      absentCatalogPlugin: generated.catalogOnlyPlugin,
      config: config(
        [marketplace(AGENT.CLAUDE_CODE, generated.marketplaceSource)],
        [plugin(AGENT.CLAUDE_CODE, REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN)],
        [AGENT.CODEX],
      ),
      expected: {
        verdict: PLUGIN_BOOTSTRAP_DECLARATION_VERDICT.HEALTHY,
        missingBaseline: [],
        expectations: [
          expectation(AGENT.CLAUDE_CODE, generated.marketplaceSource, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
        ],
        claudeOnly: [],
        codexOnly: [],
      },
    },
  ];
}
