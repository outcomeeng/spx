/**
 * Diagnose config descriptor — the `diagnose` section of `spx.config` carrying
 * the diagnostic facts a user-mode run judges against: the spx-version floor,
 * the marketplace identity, the expected plugin set, and the check set. Every
 * field is optional; an omitted fact falls back to a per-check safe default at
 * resolution time.
 * Structural validation only; the engine resolves and judges the facts.
 *
 * @module domains/diagnose/config
 */

import type { ConfigDescriptor, Result } from "@/config/types";
import {
  isNonEmptyString,
  isNonEmptyStringArray,
  type MarketplaceIdentity,
  validateMarketplaceIdentity,
} from "@/domains/diagnose/facts";

export const DIAGNOSE_SECTION = "diagnose";

export const DIAGNOSE_CONFIG_FIELDS = {
  SPX_FLOOR: "spxFloor",
  MARKETPLACE: "marketplace",
  EXPECTED_PLUGINS: "expectedPlugins",
  CHECKS: "checks",
} as const;

/** The diagnostic facts declared in the `spx.config` diagnose section; each is optional and resolves to a safe default when absent. */
export interface DiagnoseConfig {
  readonly spxFloor?: string;
  readonly marketplace?: MarketplaceIdentity;
  readonly expectedPlugins?: readonly string[];
  readonly checks?: readonly string[];
}

const defaults: DiagnoseConfig = {};

function validate(value: unknown): Result<DiagnoseConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${DIAGNOSE_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;
  const resolved: {
    spxFloor?: string;
    marketplace?: MarketplaceIdentity;
    expectedPlugins?: readonly string[];
    checks?: readonly string[];
  } = {};

  const spxFloor = candidate[DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR];
  if (spxFloor !== undefined) {
    if (!isNonEmptyString(spxFloor)) {
      return { ok: false, error: `${DIAGNOSE_SECTION}.${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR} must be a non-empty string` };
    }
    resolved.spxFloor = spxFloor;
  }

  const marketplace = candidate[DIAGNOSE_CONFIG_FIELDS.MARKETPLACE];
  if (marketplace !== undefined) {
    const result = validateMarketplaceIdentity(
      marketplace,
      `${DIAGNOSE_SECTION}.${DIAGNOSE_CONFIG_FIELDS.MARKETPLACE}`,
    );
    if (!result.ok) return result;
    resolved.marketplace = result.value;
  }

  const expectedPlugins = candidate[DIAGNOSE_CONFIG_FIELDS.EXPECTED_PLUGINS];
  if (expectedPlugins !== undefined) {
    if (!isNonEmptyStringArray(expectedPlugins)) {
      return {
        ok: false,
        error:
          `${DIAGNOSE_SECTION}.${DIAGNOSE_CONFIG_FIELDS.EXPECTED_PLUGINS} must be a non-empty array of non-empty strings`,
      };
    }
    resolved.expectedPlugins = expectedPlugins;
  }

  const checks = candidate[DIAGNOSE_CONFIG_FIELDS.CHECKS];
  if (checks !== undefined) {
    if (!isNonEmptyStringArray(checks)) {
      return {
        ok: false,
        error: `${DIAGNOSE_SECTION}.${DIAGNOSE_CONFIG_FIELDS.CHECKS} must be a non-empty array of non-empty strings`,
      };
    }
    resolved.checks = checks;
  }

  return { ok: true, value: resolved };
}

export const diagnoseConfigDescriptor: ConfigDescriptor<DiagnoseConfig> = {
  section: DIAGNOSE_SECTION,
  defaults,
  validate,
};
