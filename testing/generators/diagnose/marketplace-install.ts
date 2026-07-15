import fc from "fast-check";

import {
  type CommandCapture,
  MARKETPLACE_PLUGIN_SURFACE,
} from "@/commands/diagnose/probes";
import {
  AGENT,
  DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
  type Agent,
  type AgentMarketplaceConfig,
  type AgentPluginConfig,
  type HarnessEnvironmentConfig,
} from "@/domains/agent-environment/config";
import { REQUIRED_PLUGIN_BOOTSTRAP } from "@/domains/agent-environment/plugin-bootstrap-status";
import {
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
  type MarketplaceInstallVerdict,
} from "@/domains/diagnose/checks/marketplace-install";
import type { DiagnoseFacts } from "@/domains/diagnose/effective-facts";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { VERDICT_BUCKET, type VerdictBucket } from "@/domains/diagnose/types";
import {
  arbitraryMarketplaceSource,
  arbitraryNameToken,
  sampleDiagnoseTestValue,
} from "@testing/generators/diagnose/manifest";

type MarketplacePluginSurface = (typeof MARKETPLACE_PLUGIN_SURFACE)[keyof typeof MARKETPLACE_PLUGIN_SURFACE];

export interface MarketplaceInstallClassificationCase {
  readonly bucket: VerdictBucket;
  readonly reading: MarketplaceInstallReading;
  readonly verdict: MarketplaceInstallVerdict;
}

export interface MarketplaceRegistrationMappingCase {
  readonly bucket: VerdictBucket;
  readonly facts: DiagnoseFacts;
  readonly surfaceCaptures: readonly MarketplaceSurfaceCapture[];
  readonly title: string;
  readonly verdict: MarketplaceInstallVerdict;
}

export interface MarketplaceSurfaceCapture {
  readonly marketplaceCapture: CommandCapture;
  readonly pluginCapture: CommandCapture;
  readonly surface: MarketplacePluginSurface;
}

interface MarketplaceRegistrationScenario {
  readonly alternateMarketplace: string;
  readonly alternateSource: string;
  readonly catalogOnlyPlugin: string;
  readonly claudePlugin: string;
  readonly codexPlugin: string;
  readonly invalidJson: string;
  readonly marketplaceSource: string;
}

function marketplaceInstallReading(
  overrides: Partial<MarketplaceInstallReading>,
): MarketplaceInstallReading {
  return {
    configured: true,
    errored: false,
    surfacePresent: true,
    unregistered: false,
    drifted: false,
    ...overrides,
  };
}

export function marketplaceInstallClassificationCases(): readonly MarketplaceInstallClassificationCase[] {
  return [
    {
      reading: marketplaceInstallReading({}),
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      reading: marketplaceInstallReading({ drifted: true }),
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      reading: marketplaceInstallReading({ unregistered: true }),
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      reading: marketplaceInstallReading({ surfacePresent: false }),
      verdict: MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      reading: marketplaceInstallReading({ configured: false, surfacePresent: false }),
      verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
    {
      reading: marketplaceInstallReading({ errored: true }),
      verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      reading: marketplaceInstallReading({ unregistered: true, drifted: true }),
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
  ];
}

function generatedScenario(): MarketplaceRegistrationScenario {
  return sampleDiagnoseTestValue(
    fc.record({
      alternateMarketplace: arbitraryNameToken(),
      alternateSource: arbitraryMarketplaceSource(),
      catalogOnlyPlugin: arbitraryNameToken(),
      claudePlugin: arbitraryNameToken(),
      codexPlugin: arbitraryNameToken(),
      invalidJson: arbitraryNameToken().map((token) => `{${token}`),
      marketplaceSource: arbitraryMarketplaceSource(),
    }).filter((scenario) =>
      scenario.alternateMarketplace !== REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE
      && scenario.alternateSource !== scenario.marketplaceSource
      && new Set([
        scenario.catalogOnlyPlugin,
        scenario.claudePlugin,
        scenario.codexPlugin,
        REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN,
      ]).size === 4
    ),
  );
}

function marketplace(agent: Agent, source: string): AgentMarketplaceConfig {
  return { agent, name: REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE, source };
}

function plugin(agent: Agent, name: string): AgentPluginConfig {
  return { agent, name, marketplace: REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE };
}

function harnessConfig(
  scenario: MarketplaceRegistrationScenario,
  pluginsByAgent: Readonly<Partial<Record<Agent, readonly string[]>>>,
): HarnessEnvironmentConfig {
  const enabledAgents = Object.values(AGENT).filter((agent) => pluginsByAgent[agent] !== undefined);
  return {
    ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
    agents: {
      [AGENT.CLAUDE_CODE]: {
        ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents[AGENT.CLAUDE_CODE],
        enabled: enabledAgents.includes(AGENT.CLAUDE_CODE),
      },
      [AGENT.CODEX]: {
        ...DEFAULT_HARNESS_ENVIRONMENT_CONFIG.agents[AGENT.CODEX],
        enabled: enabledAgents.includes(AGENT.CODEX),
      },
    },
    pluginBootstrap: {
      marketplaces: enabledAgents.map((agent) => marketplace(agent, scenario.marketplaceSource)),
      plugins: enabledAgents.flatMap((agent) =>
        (pluginsByAgent[agent] ?? []).map((name) => plugin(agent, name))
      ),
      skills: [],
    },
  };
}

function facts(
  scenario: MarketplaceRegistrationScenario,
  pluginsByAgent: Readonly<Partial<Record<Agent, readonly string[]>>>,
): DiagnoseFacts {
  return {
    checks: [CHECK_NAME.MARKETPLACE_INSTALL],
    harnessEnvironment: harnessConfig(scenario, pluginsByAgent),
  };
}

function surfaceAgent(surface: MarketplacePluginSurface): Agent {
  return surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE ? AGENT.CLAUDE_CODE : AGENT.CODEX;
}

function registeredMarketplaceStdout(
  surface: MarketplacePluginSurface,
  source: string,
  name = REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE,
): string {
  if (surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE) {
    return JSON.stringify([{ name, repo: source }]);
  }
  return JSON.stringify({
    marketplaces: [{ name, marketplaceSource: { source } }],
  });
}

function installedPluginsStdout(
  surface: MarketplacePluginSurface,
  plugins: readonly string[],
  marketplaceName = REQUIRED_PLUGIN_BOOTSTRAP.MARKETPLACE,
  enabled = true,
): string {
  if (surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE) {
    return JSON.stringify(plugins.map((name) => ({ id: `${name}@${marketplaceName}`, enabled })));
  }
  return JSON.stringify({
    installed: plugins.map((name) => ({
      pluginId: `${name}@${marketplaceName}`,
      name,
      marketplaceName,
      enabled,
    })),
  });
}

function capture(
  scenario: MarketplaceRegistrationScenario,
  surface: MarketplacePluginSurface,
  plugins: readonly string[],
  options: {
    readonly enabled?: boolean;
    readonly marketplaceName?: string;
    readonly marketplaceSource?: string;
    readonly pluginMarketplaceName?: string;
  } = {},
): MarketplaceSurfaceCapture {
  return {
    surface,
    marketplaceCapture: {
      ok: true,
      stdout: registeredMarketplaceStdout(
        surface,
        options.marketplaceSource ?? scenario.marketplaceSource,
        options.marketplaceName,
      ),
    },
    pluginCapture: {
      ok: true,
      stdout: installedPluginsStdout(
        surface,
        plugins,
        options.pluginMarketplaceName,
        options.enabled,
      ),
    },
  };
}

function oneAgentFacts(
  scenario: MarketplaceRegistrationScenario,
  surface: MarketplacePluginSurface,
  pluginName: string,
): DiagnoseFacts {
  return facts(scenario, {
    [surfaceAgent(surface)]: [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, pluginName],
  });
}

function oneAgentCases(
  scenario: MarketplaceRegistrationScenario,
  surface: MarketplacePluginSurface,
  pluginName: string,
): readonly MarketplaceRegistrationMappingCase[] {
  const expectedPlugins = [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, pluginName];
  const configuredFacts = oneAgentFacts(scenario, surface, pluginName);
  return [
    {
      title: `${surface}: exact marketplace and configured subset are installed`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, expectedPlugins)],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: `${surface}: unrelated installed offerings do not change health`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, [...expectedPlugins, scenario.catalogOnlyPlugin])],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: `${surface}: matching marketplace name with another source is unregistered`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, expectedPlugins, {
        marketplaceSource: scenario.alternateSource,
      })],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      title: `${surface}: another marketplace name with matching source is unregistered`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, expectedPlugins, {
        marketplaceName: scenario.alternateMarketplace,
      })],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      title: `${surface}: configured plugin installed under another marketplace is drifted`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, expectedPlugins, {
        pluginMarketplaceName: scenario.alternateMarketplace,
      })],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: `${surface}: configured plugin is disabled`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, expectedPlugins, { enabled: false })],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: `${surface}: configured plugin is missing`,
      facts: configuredFacts,
      surfaceCaptures: [capture(scenario, surface, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN])],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
  ];
}

function aggregateCases(
  scenario: MarketplaceRegistrationScenario,
): readonly MarketplaceRegistrationMappingCase[] {
  const bothFacts = facts(scenario, {
    [AGENT.CLAUDE_CODE]: [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, scenario.claudePlugin],
    [AGENT.CODEX]: [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, scenario.codexPlugin],
  });
  const claudeExpected = [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, scenario.claudePlugin];
  const codexExpected = [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN, scenario.codexPlugin];
  return [
    {
      title: "Claude and Codex evaluate their own configured subsets",
      facts: bothFacts,
      surfaceCaptures: [
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE, claudeExpected),
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX, codexExpected),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: "an absent enabled-agent CLI contributes no surface verdict",
      facts: bothFacts,
      surfaceCaptures: [capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE, claudeExpected)],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: "drifted aggregates ahead of installed",
      facts: bothFacts,
      surfaceCaptures: [
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE, claudeExpected),
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "unregistered aggregates ahead of drifted",
      facts: bothFacts,
      surfaceCaptures: [
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE, [REQUIRED_PLUGIN_BOOTSTRAP.PLUGIN]),
        capture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX, codexExpected, {
          marketplaceSource: scenario.alternateSource,
        }),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      title: "no enabled-agent plugin CLI is available",
      facts: bothFacts,
      surfaceCaptures: [],
      verdict: MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "marketplace command failure is unknown",
      facts: bothFacts,
      surfaceCaptures: [{
        surface: MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        marketplaceCapture: { ok: false, stdout: "" },
        pluginCapture: { ok: false, stdout: "" },
      }],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      title: "marketplace output parse failure is unknown",
      facts: bothFacts,
      surfaceCaptures: [{
        surface: MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        marketplaceCapture: { ok: true, stdout: scenario.invalidJson },
        pluginCapture: { ok: true, stdout: JSON.stringify([]) },
      }],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      title: "no configured enabled agent is not applicable",
      facts: facts(scenario, {}),
      surfaceCaptures: [],
      verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
  ];
}

export function marketplaceRegistrationMappingCases(): readonly MarketplaceRegistrationMappingCase[] {
  const scenario = generatedScenario();
  return [
    ...oneAgentCases(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE, scenario.claudePlugin),
    ...oneAgentCases(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX, scenario.codexPlugin),
    ...aggregateCases(scenario),
  ];
}
