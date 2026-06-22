/**
 * The marketplace-install diagnose check — classifies the methodology
 * marketplace's install state across the Claude and Codex plugin surfaces,
 * offered-against-installed. The classification is pure over the gathered
 * reading; the reading is obtained through a dependency-injected probe that
 * shells out to the present plugin CLIs.
 *
 * @module domains/diagnose/checks/marketplace-install
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME, type MarketplaceIdentity } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The marketplace-install verdict labels. */
export const MARKETPLACE_INSTALL_VERDICT = {
  INSTALLED: "installed",
  DRIFTED: "drifted",
  UNREGISTERED: "unregistered",
  NOT_APPLICABLE: "not-applicable",
  UNKNOWN: "unknown",
} as const;

export type MarketplaceInstallVerdict = (typeof MARKETPLACE_INSTALL_VERDICT)[keyof typeof MARKETPLACE_INSTALL_VERDICT];

/** The reading the probe gathers about the marketplace install state. */
export interface MarketplaceInstallReading {
  /** True when a plugin CLI command errored. */
  readonly errored: boolean;
  /** True when at least one plugin surface (Claude or Codex) exposes a plugin CLI. */
  readonly surfacePresent: boolean;
  /** True when a present surface lacks the marketplace registration. */
  readonly unregistered: boolean;
  /** True when a registered surface has a plugin missing, disabled, or below the offered version. */
  readonly drifted: boolean;
}

/** The injected boundary that gathers the marketplace-install reading against the manifest's consumer facts. */
export interface MarketplaceInstallProbe {
  probe(marketplace: MarketplaceIdentity, expectedPlugins: readonly string[]): Promise<MarketplaceInstallReading>;
}

const REMEDIATION: Readonly<Record<MarketplaceInstallVerdict, string>> = {
  [MARKETPLACE_INSTALL_VERDICT.INSTALLED]: "Marketplace and plugins are installed and current; no action needed.",
  [MARKETPLACE_INSTALL_VERDICT.DRIFTED]:
    "Install, enable, or update the expected plugins to the offered version on the drifted surface.",
  [MARKETPLACE_INSTALL_VERDICT.UNREGISTERED]: "Register the methodology marketplace on the present plugin surface.",
  [MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE]: "No plugin CLI surface present; no action needed.",
  [MARKETPLACE_INSTALL_VERDICT.UNKNOWN]: "Re-run diagnose; if it persists, inspect the claude/codex plugin CLI output.",
};

function record(
  verdict: MarketplaceInstallVerdict,
  bucket: CheckRecord["bucket"],
  reading: MarketplaceInstallReading,
): CheckRecord {
  return {
    name: CHECK_NAME.MARKETPLACE_INSTALL,
    verdict,
    bucket,
    readings: {
      surface: String(reading.surfacePresent),
      unregistered: String(reading.unregistered),
      drifted: String(reading.drifted),
    },
    remediation: REMEDIATION[verdict],
  };
}

/** Classifies the marketplace-install reading into a check record. */
export function classifyMarketplaceInstall(reading: MarketplaceInstallReading): CheckRecord {
  if (reading.errored) {
    return record(MARKETPLACE_INSTALL_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (!reading.surfacePresent) {
    return record(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE, reading);
  }
  if (reading.unregistered) {
    return record(MARKETPLACE_INSTALL_VERDICT.UNREGISTERED, VERDICT_BUCKET.BROKEN, reading);
  }
  if (reading.drifted) {
    return record(MARKETPLACE_INSTALL_VERDICT.DRIFTED, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(MARKETPLACE_INSTALL_VERDICT.INSTALLED, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the marketplace-install check runner over an injected probe, passing the manifest's consumer facts. */
export function marketplaceInstallRunner(probe: MarketplaceInstallProbe): CheckRunner {
  return async (manifest) => {
    if (manifest.marketplace === undefined || manifest.expectedPlugins === undefined) {
      // Unreachable in production: parseManifest rejects a marketplace-install manifest without these facts.
      // With no marketplace to probe, the not-applicable verdict is the honest reading, not an error.
      return classifyMarketplaceInstall({ errored: false, surfacePresent: false, unregistered: false, drifted: false });
    }
    return classifyMarketplaceInstall(await probe.probe(manifest.marketplace, manifest.expectedPlugins));
  };
}
