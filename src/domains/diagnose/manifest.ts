/**
 * Diagnose manifest contract — parses and validates the consumer-supplied
 * declarative manifest into the typed contract the pipeline judges against. The
 * manifest carries the consumer-varying facts the `spx` CLI must not hard-code:
 * the spx-version floor, the marketplace identity, the expected plugin set, and
 * the check set. Validation is conditional: a fact is required exactly when a
 * check that reads it is selected. Pure over the raw JSON text; no I/O.
 *
 * @module domains/diagnose/manifest
 */

import {
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
  validateMethodologyConfig,
} from "@/config/methodology";
import type { Result } from "@/config/types";
import {
  isNonEmptyString,
  isNonEmptyStringArray,
  isRecord,
  type MarketplaceIdentity,
  validateMarketplaceIdentity,
} from "@/domains/diagnose/facts";

/** The diagnose checks the pipeline knows how to run, named in the manifest's check set. */
export const CHECK_NAME = {
  SESSION_ENVIRONMENT: "session-environment",
  SPX_REACHABILITY: "spx-reachability",
  WORKTREE_POOL: "worktree-pool",
  SESSION_STORE: "session-store",
  MARKETPLACE_INSTALL: "marketplace-install",
  METHODOLOGY_CONTEXT: "methodology-context",
} as const;

export type CheckName = (typeof CHECK_NAME)[keyof typeof CHECK_NAME];

/**
 * The manifest's wire keys — the top-level JSON fields a consumer writes. The
 * methodology facts sit under the configuration's own methodology section key.
 */
export const MANIFEST_FIELDS = {
  SPX_FLOOR: "spx_floor",
  MARKETPLACE: "marketplace",
  EXPECTED_PLUGINS: "expected_plugins",
  CHECKS: "checks",
  METHODOLOGY: METHODOLOGY_SECTION,
} as const;

function missingFactError(check: CheckName, field: string): string {
  return `manifest selects \`${check}\` but carries no \`${field}\``;
}

/** The typed, validated manifest contract. */
export interface DiagnoseManifest {
  /** The spx-version floor; present when `spx-reachability` is selected. */
  readonly spxFloor?: string;
  /** The marketplace identity; present when `marketplace-install` is selected. */
  readonly marketplace?: MarketplaceIdentity;
  /** The expected plugin set; present when `marketplace-install` is selected. */
  readonly expectedPlugins?: readonly string[];
  /** The check set the pipeline runs, in order. */
  readonly checks: readonly CheckName[];
  /** The configured methodology source/version; present on config-driven runs. */
  readonly methodology?: MethodologyConfig;
  /** A config-derived methodology resolution error; present only when methodology-context should own the failure. */
  readonly methodologyError?: string;
}

function validateChecks(raw: unknown, available: ReadonlySet<string>): Result<readonly CheckName[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: `manifest \`${MANIFEST_FIELDS.CHECKS}\` must be a non-empty array of check names` };
  }
  const unavailable = raw.filter((name) => !available.has(name as string));
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `manifest \`${MANIFEST_FIELDS.CHECKS}\` names checks not available in this build: ${
        unavailable.join(", ")
      }`,
    };
  }
  return { ok: true, value: raw as readonly CheckName[] };
}

function validateManifestMethodology(
  parsed: Record<string, unknown>,
  checks: readonly CheckName[],
): Result<MethodologyConfig | undefined> {
  if (!checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
    return { ok: true, value: undefined };
  }

  const raw = parsed[MANIFEST_FIELDS.METHODOLOGY];
  if (raw === undefined) {
    return { ok: false, error: missingFactError(CHECK_NAME.METHODOLOGY_CONTEXT, MANIFEST_FIELDS.METHODOLOGY) };
  }

  if (
    !isRecord(raw)
    || !isNonEmptyString(raw[METHODOLOGY_CONFIG_FIELDS.SOURCE])
    || !isNonEmptyString(raw[METHODOLOGY_CONFIG_FIELDS.VERSION])
  ) {
    return {
      ok: false,
      error:
        `manifest selects \`${CHECK_NAME.METHODOLOGY_CONTEXT}\` but carries incomplete \`${MANIFEST_FIELDS.METHODOLOGY}\``,
    };
  }

  const methodology = validateMethodologyConfig(raw);
  if (!methodology.ok) {
    return { ok: false, error: `manifest \`${MANIFEST_FIELDS.METHODOLOGY}\`: ${methodology.error}` };
  }
  return methodology;
}

/**
 * Parses the raw manifest JSON and validates it into the typed contract against
 * the checks available in this build. A manifest naming a check absent from
 * `availableChecks` is rejected, as is one that selects a check without that
 * check's required consumer facts, each read under its `MANIFEST_FIELDS` key:
 * `spx-reachability` requires the spx-version floor, `marketplace-install`
 * requires the marketplace identity and the expected plugin set, and
 * `methodology-context` requires the methodology facts.
 */
export function parseManifest(rawJson: string, availableChecks: readonly CheckName[]): Result<DiagnoseManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return { ok: false, error: `manifest is not valid JSON: ${(error as Error).message}` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "manifest must be a JSON object" };
  }

  const checks = validateChecks(parsed[MANIFEST_FIELDS.CHECKS], new Set(availableChecks));
  if (!checks.ok) return checks;

  const manifest: {
    spxFloor?: string;
    marketplace?: MarketplaceIdentity;
    expectedPlugins?: readonly string[];
    checks: readonly CheckName[];
    methodology?: MethodologyConfig;
  } = { checks: checks.value };

  const methodology = validateManifestMethodology(parsed, checks.value);
  if (!methodology.ok) return methodology;
  manifest.methodology = methodology.value;

  if (checks.value.includes(CHECK_NAME.SPX_REACHABILITY)) {
    const spxFloor = parsed[MANIFEST_FIELDS.SPX_FLOOR];
    if (!isNonEmptyString(spxFloor)) {
      return { ok: false, error: missingFactError(CHECK_NAME.SPX_REACHABILITY, MANIFEST_FIELDS.SPX_FLOOR) };
    }
    manifest.spxFloor = spxFloor;
  }

  if (checks.value.includes(CHECK_NAME.MARKETPLACE_INSTALL)) {
    const marketplace = validateMarketplaceIdentity(
      parsed[MANIFEST_FIELDS.MARKETPLACE],
      `manifest \`${MANIFEST_FIELDS.MARKETPLACE}\``,
    );
    if (!marketplace.ok) return marketplace;
    const expectedPlugins = parsed[MANIFEST_FIELDS.EXPECTED_PLUGINS];
    if (!isNonEmptyStringArray(expectedPlugins)) {
      return {
        ok: false,
        error: missingFactError(CHECK_NAME.MARKETPLACE_INSTALL, MANIFEST_FIELDS.EXPECTED_PLUGINS),
      };
    }
    manifest.marketplace = marketplace.value;
    manifest.expectedPlugins = expectedPlugins;
  }

  return { ok: true, value: manifest };
}
