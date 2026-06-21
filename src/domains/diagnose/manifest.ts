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

import type { Result } from "@/config/types";

/** The diagnose checks the pipeline knows how to run, named in the manifest's check set. */
export const CHECK_NAME = {
  SESSION_ENVIRONMENT: "session-environment",
  SPX_REACHABILITY: "spx-reachability",
  WORKTREE_POOL: "worktree-pool",
  SESSION_STORE: "session-store",
  MARKETPLACE_INSTALL: "marketplace-install",
} as const;

export type CheckName = (typeof CHECK_NAME)[keyof typeof CHECK_NAME];

/** The marketplace identity a consumer depends on. */
export interface MarketplaceIdentity {
  readonly name: string;
  readonly source: string;
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validateChecks(raw: unknown, available: ReadonlySet<string>): Result<readonly CheckName[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "manifest `checks` must be a non-empty array of check names" };
  }
  const unavailable = raw.filter((name) => !available.has(name as string));
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `manifest \`checks\` names checks not available in this build: ${unavailable.join(", ")}`,
    };
  }
  return { ok: true, value: raw as readonly CheckName[] };
}

function validateMarketplace(raw: unknown): Result<MarketplaceIdentity> {
  if (!isRecord(raw) || !isNonEmptyString(raw.name) || !isNonEmptyString(raw.source)) {
    return { ok: false, error: "manifest `marketplace` must carry a non-empty `name` and `source`" };
  }
  return { ok: true, value: { name: raw.name, source: raw.source } };
}

/**
 * Parses the raw manifest JSON and validates it into the typed contract against
 * the checks available in this build. A manifest naming a check absent from
 * `availableChecks` is rejected, as is one that selects a check without that
 * check's required consumer facts: `spx-reachability` requires `spx_floor`, and
 * `marketplace-install` requires `marketplace` and `expected_plugins`.
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

  const checks = validateChecks(parsed.checks, new Set(availableChecks));
  if (!checks.ok) return checks;

  const manifest: {
    spxFloor?: string;
    marketplace?: MarketplaceIdentity;
    expectedPlugins?: readonly string[];
    checks: readonly CheckName[];
  } = { checks: checks.value };

  if (checks.value.includes(CHECK_NAME.SPX_REACHABILITY)) {
    if (!isNonEmptyString(parsed.spx_floor)) {
      return { ok: false, error: "manifest selects `spx-reachability` but carries no `spx_floor`" };
    }
    manifest.spxFloor = parsed.spx_floor;
  }

  if (checks.value.includes(CHECK_NAME.MARKETPLACE_INSTALL)) {
    const marketplace = validateMarketplace(parsed.marketplace);
    if (!marketplace.ok) return marketplace;
    if (!Array.isArray(parsed.expected_plugins) || !parsed.expected_plugins.every(isNonEmptyString)) {
      return { ok: false, error: "manifest selects `marketplace-install` but carries no `expected_plugins`" };
    }
    manifest.marketplace = marketplace.value;
    manifest.expectedPlugins = parsed.expected_plugins;
  }

  return { ok: true, value: manifest };
}
