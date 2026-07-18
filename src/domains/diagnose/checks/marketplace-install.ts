/**
 * The marketplace-install diagnose check — classifies the methodology
 * marketplace's install state across the Claude and Codex plugin surfaces,
 * offered-against-installed. The classification is pure over the gathered
 * reading; the reading is obtained through a dependency-injected probe that
 * shells out to the present plugin CLIs.
 *
 * @module domains/diagnose/checks/marketplace-install
 */

import {
  type AgentPluginExpectation,
  classifyPluginBootstrapDeclarations,
} from "@/domains/agent-environment/plugin-bootstrap-status";
import { type CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The marketplace-install verdict labels. */
export const MARKETPLACE_INSTALL_VERDICT = {
  INSTALLED: "installed",
  DRIFTED: "drifted",
  CLI_UNAVAILABLE: "plugin-cli-unavailable",
  UNREGISTERED: "unregistered",
  NOT_APPLICABLE: "not-applicable",
  UNKNOWN: "unknown",
} as const;

export type MarketplaceInstallVerdict = (typeof MARKETPLACE_INSTALL_VERDICT)[keyof typeof MARKETPLACE_INSTALL_VERDICT];

/** The reading the probe gathers about the marketplace install state. */
export interface MarketplaceInstallReading {
  /** True when at least one enabled agent has configured marketplace intent. */
  readonly configured: boolean;
  /** True when a plugin CLI command errored. */
  readonly errored: boolean;
  /** True when at least one plugin surface (Claude or Codex) exposes a plugin CLI. */
  readonly surfacePresent: boolean;
  /** True when a present surface lacks the marketplace registration. */
  readonly unregistered: boolean;
  /** True when a registered surface has an expected plugin missing or installed but disabled. */
  readonly drifted: boolean;
}

/** The CLI-probe reading before the runner adds configuration context. */
export type MarketplaceInstallProbeReading = Omit<MarketplaceInstallReading, "configured">;

/** The injected boundary that gathers live state against product-configured agent expectations. */
export interface MarketplaceInstallProbe {
  probe(expectations: readonly AgentPluginExpectation[]): Promise<MarketplaceInstallProbeReading>;
}

export const MARKETPLACE_INSTALL_REMEDIATION: Readonly<Record<MarketplaceInstallVerdict, string>> = {
  [MARKETPLACE_INSTALL_VERDICT.INSTALLED]:
    "Configured marketplaces and expected plugins are installed and enabled; no action needed.",
  [MARKETPLACE_INSTALL_VERDICT.DRIFTED]: "Install or enable the expected plugins on the drifted surface.",
  [MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE]:
    "Install or enable the Claude or Codex plugin CLI, then re-run diagnose.",
  [MARKETPLACE_INSTALL_VERDICT.UNREGISTERED]: "Register the configured marketplace on the affected plugin surface.",
  [MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE]: "Marketplace install check is not configured; no action needed.",
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
      configured: String(reading.configured),
      surface: String(reading.surfacePresent),
      unregistered: String(reading.unregistered),
      drifted: String(reading.drifted),
    },
    remediation: MARKETPLACE_INSTALL_REMEDIATION[verdict],
  };
}

/** Classifies the marketplace-install reading into a check record. */
export function classifyMarketplaceInstall(reading: MarketplaceInstallReading): CheckRecord {
  if (reading.errored) {
    return record(MARKETPLACE_INSTALL_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (!reading.configured) {
    return record(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE, reading);
  }
  if (!reading.surfacePresent) {
    return record(MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (reading.unregistered) {
    return record(MARKETPLACE_INSTALL_VERDICT.UNREGISTERED, VERDICT_BUCKET.BROKEN, reading);
  }
  if (reading.drifted) {
    return record(MARKETPLACE_INSTALL_VERDICT.DRIFTED, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(MARKETPLACE_INSTALL_VERDICT.INSTALLED, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the marketplace-install check runner over an injected probe and product-owned harness facts. */
export function marketplaceInstallRunner(probe: MarketplaceInstallProbe): CheckRunner {
  return async (facts) => {
    const expectations = classifyPluginBootstrapDeclarations(facts.harnessEnvironment).expectations;
    if (expectations.length === 0) {
      return classifyMarketplaceInstall({
        configured: false,
        errored: false,
        surfacePresent: false,
        unregistered: false,
        drifted: false,
      });
    }
    return classifyMarketplaceInstall({
      ...(await probe.probe(expectations)),
      configured: true,
    });
  };
}
