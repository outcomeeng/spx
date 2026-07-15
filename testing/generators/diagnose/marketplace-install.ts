import fc from "fast-check";

import { type CommandCapture, MARKETPLACE_PLUGIN_SURFACE } from "@/commands/diagnose/probes";
import {
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
  type MarketplaceInstallVerdict,
} from "@/domains/diagnose/checks/marketplace-install";
import type { MarketplaceIdentity } from "@/domains/diagnose/facts";
import { CHECK_NAME, type DiagnoseManifest } from "@/domains/diagnose/manifest";
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
  readonly manifest: DiagnoseManifest;
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
  readonly alternateName: string;
  readonly alternateSource: string;
  readonly expectedPlugins: readonly string[];
  readonly marketplace: MarketplaceIdentity;
  readonly surface: MarketplacePluginSurface;
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

function arbitraryMarketplaceRegistrationScenario(
  surface: MarketplacePluginSurface,
): fc.Arbitrary<MarketplaceRegistrationScenario> {
  return fc
    .tuple(
      arbitraryNameToken(),
      arbitraryNameToken(),
      arbitraryMarketplaceSource(),
      arbitraryMarketplaceSource(),
      arbitraryNameToken(),
    )
    .filter(([name, alternateName, source, alternateSource]) => name !== alternateName && source !== alternateSource)
    .map(([name, alternateName, source, alternateSource, plugin]) => ({
      alternateName,
      alternateSource,
      expectedPlugins: [plugin],
      marketplace: { name, source },
      surface,
    }));
}

function registeredMarketplaceStdout(
  surface: MarketplacePluginSurface,
  marketplace: MarketplaceIdentity,
): string {
  if (surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE) {
    return JSON.stringify([{ name: marketplace.name, repo: marketplace.source }]);
  }
  return JSON.stringify({
    marketplaces: [
      {
        name: marketplace.name,
        marketplaceSource: { source: marketplace.source },
      },
    ],
  });
}

function installedPluginsStdout(
  surface: MarketplacePluginSurface,
  marketplace: MarketplaceIdentity,
  expectedPlugins: readonly string[],
  enabled = true,
): string {
  if (surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE) {
    return JSON.stringify(
      expectedPlugins.map((name) => ({
        id: `${name}@${marketplace.name}`,
        enabled,
      })),
    );
  }
  return JSON.stringify({
    installed: expectedPlugins.map((name) => ({ name, enabled })),
  });
}

function emptyInstalledPluginsStdout(surface: MarketplacePluginSurface): string {
  if (surface === MARKETPLACE_PLUGIN_SURFACE.CLAUDE) return JSON.stringify([]);
  return JSON.stringify({ installed: [] });
}

function surfaceCapture(
  scenario: MarketplaceRegistrationScenario,
  marketplace: MarketplaceIdentity,
  pluginCapture: CommandCapture,
  surface = scenario.surface,
): MarketplaceSurfaceCapture {
  return {
    surface,
    marketplaceCapture: {
      ok: true,
      stdout: registeredMarketplaceStdout(surface, marketplace),
    },
    pluginCapture,
  };
}

function enabledPluginCapture(
  scenario: MarketplaceRegistrationScenario,
  surface = scenario.surface,
): CommandCapture {
  return {
    ok: true,
    stdout: installedPluginsStdout(
      surface,
      scenario.marketplace,
      scenario.expectedPlugins,
    ),
  };
}

function manifestFor(scenario: MarketplaceRegistrationScenario): DiagnoseManifest {
  return {
    checks: [CHECK_NAME.MARKETPLACE_INSTALL],
    marketplace: scenario.marketplace,
    expectedPlugins: scenario.expectedPlugins,
  };
}

function mappingCasesFor(
  scenario: MarketplaceRegistrationScenario,
): readonly MarketplaceRegistrationMappingCase[] {
  return [
    {
      title: `${scenario.surface}: exact name and source`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(scenario, scenario.marketplace, enabledPluginCapture(scenario)),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: `${scenario.surface}: matching name with another source`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          {
            name: scenario.marketplace.name,
            source: scenario.alternateSource,
          },
          enabledPluginCapture(scenario),
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      title: `${scenario.surface}: another name with matching source`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          {
            name: scenario.alternateName,
            source: scenario.marketplace.source,
          },
          enabledPluginCapture(scenario),
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
  ];
}

function remainingProbeMappingCases(
  scenario: MarketplaceRegistrationScenario,
): readonly MarketplaceRegistrationMappingCase[] {
  return [
    {
      title: `${scenario.surface}: expected plugin is disabled`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(scenario, scenario.marketplace, {
          ok: true,
          stdout: installedPluginsStdout(
            scenario.surface,
            scenario.marketplace,
            scenario.expectedPlugins,
            false,
          ),
        }),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: `${scenario.surface}: expected plugin is missing`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(scenario, scenario.marketplace, {
          ok: true,
          stdout: emptyInstalledPluginsStdout(scenario.surface),
        }),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "no plugin CLI is available",
      manifest: manifestFor(scenario),
      surfaceCaptures: [],
      verdict: MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "marketplace facts are absent",
      manifest: { checks: [CHECK_NAME.MARKETPLACE_INSTALL] },
      surfaceCaptures: [],
      verdict: MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
    {
      title: `${scenario.surface}: marketplace command errors`,
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        {
          surface: scenario.surface,
          marketplaceCapture: { ok: false, stdout: "" },
          pluginCapture: { ok: false, stdout: "" },
        },
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      title: "Claude and Codex installed aggregate to installed",
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE),
          MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        ),
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX),
          MARKETPLACE_PLUGIN_SURFACE.CODEX,
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.INSTALLED,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      title: "Claude drifted plus Codex installed aggregates to drifted",
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          scenario.marketplace,
          {
            ok: true,
            stdout: emptyInstalledPluginsStdout(MARKETPLACE_PLUGIN_SURFACE.CLAUDE),
          },
          MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        ),
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX),
          MARKETPLACE_PLUGIN_SURFACE.CODEX,
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "Claude unregistered plus Codex installed aggregates to unregistered",
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          {
            name: scenario.alternateName,
            source: scenario.marketplace.source,
          },
          { ok: false, stdout: "" },
          MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        ),
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CODEX),
          MARKETPLACE_PLUGIN_SURFACE.CODEX,
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      title: "Claude installed plus Codex drifted aggregates to drifted",
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE),
          MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        ),
        surfaceCapture(
          scenario,
          scenario.marketplace,
          {
            ok: true,
            stdout: emptyInstalledPluginsStdout(MARKETPLACE_PLUGIN_SURFACE.CODEX),
          },
          MARKETPLACE_PLUGIN_SURFACE.CODEX,
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.DRIFTED,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      title: "Claude installed plus Codex unregistered aggregates to unregistered",
      manifest: manifestFor(scenario),
      surfaceCaptures: [
        surfaceCapture(
          scenario,
          scenario.marketplace,
          enabledPluginCapture(scenario, MARKETPLACE_PLUGIN_SURFACE.CLAUDE),
          MARKETPLACE_PLUGIN_SURFACE.CLAUDE,
        ),
        surfaceCapture(
          scenario,
          {
            name: scenario.alternateName,
            source: scenario.marketplace.source,
          },
          { ok: false, stdout: "" },
          MARKETPLACE_PLUGIN_SURFACE.CODEX,
        ),
      ],
      verdict: MARKETPLACE_INSTALL_VERDICT.UNREGISTERED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
  ];
}

export function marketplaceRegistrationMappingCases(): readonly MarketplaceRegistrationMappingCase[] {
  const registrationCases = Object.values(MARKETPLACE_PLUGIN_SURFACE).flatMap((surface) =>
    mappingCasesFor(
      sampleDiagnoseTestValue(arbitraryMarketplaceRegistrationScenario(surface)),
    )
  );
  return [
    ...registrationCases,
    ...remainingProbeMappingCases(
      sampleDiagnoseTestValue(
        arbitraryMarketplaceRegistrationScenario(MARKETPLACE_PLUGIN_SURFACE.CLAUDE),
      ),
    ),
  ];
}
