/**
 * Diagnose manifest contract — parses and validates the consumer-supplied
 * declarative manifest into the typed contract the pipeline judges against. The
 * manifest carries the consumer-varying facts the `spx` CLI must not hard-code:
 * the spx-version floor, methodology selection, and check set. Validation is
 * conditional: a fact is required
 * exactly when a check that reads it is selected. Pure over the raw JSON text;
 * no I/O.
 *
 * @module domains/diagnose/manifest
 */

import { METHODOLOGY_CONFIG_FIELDS, type MethodologyConfig, validateMethodologyConfig } from "@/config/methodology";
import type { Result } from "@/config/types";
import { isNonEmptyString, isRecord } from "@/domains/diagnose/facts";

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

export const DIAGNOSE_MANIFEST_FIELDS = {
  CHECKS: "checks",
  SPX_FLOOR: "spx_floor",
  METHODOLOGY: "methodology",
} as const;

export const RETIRED_DIAGNOSE_MANIFEST_FIELDS = {
  MARKETPLACE: "marketplace",
  EXPECTED_PLUGINS: "expected_plugins",
} as const;

/** The typed, validated manifest contract. */
export interface DiagnoseManifest {
  /** The spx-version floor; present when `spx-reachability` is selected. */
  readonly spxFloor?: string;
  /** The check set the pipeline runs, in order. */
  readonly checks: readonly CheckName[];
  /** The configured methodology source/version; present when methodology-context is selected. */
  readonly methodology?: MethodologyConfig;
}

const DIAGNOSE_MANIFEST_FIELD_SET: ReadonlySet<string> = new Set(Object.values(DIAGNOSE_MANIFEST_FIELDS));

function validateChecks(raw: unknown, available: ReadonlySet<string>): Result<readonly CheckName[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "manifest `checks` must be a non-empty array of check names" };
  }
  const checks: CheckName[] = [];
  const unavailable: string[] = [];
  for (const name of raw) {
    if (typeof name !== "string") {
      return { ok: false, error: "manifest `checks` entries must be check-name strings" };
    }
    if (available.has(name)) {
      checks.push(name as CheckName);
    } else {
      unavailable.push(name);
    }
  }
  if (unavailable.length > 0) {
    return {
      ok: false,
      error: `manifest \`checks\` names checks not available in this build: ${unavailable.join(", ")}`,
    };
  }
  return { ok: true, value: checks };
}

function validateManifestMethodology(
  parsed: Record<string, unknown>,
  checks: readonly CheckName[],
): Result<MethodologyConfig | undefined> {
  if (!checks.includes(CHECK_NAME.METHODOLOGY_CONTEXT)) {
    return { ok: true, value: undefined };
  }

  const methodologyValue = parsed[DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY];
  if (methodologyValue === undefined) {
    return {
      ok: false,
      error:
        `manifest selects '${CHECK_NAME.METHODOLOGY_CONTEXT}' but carries no '${DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY}'`,
    };
  }

  if (
    !isRecord(methodologyValue)
    || !isNonEmptyString(methodologyValue[METHODOLOGY_CONFIG_FIELDS.SOURCE])
    || !isNonEmptyString(methodologyValue[METHODOLOGY_CONFIG_FIELDS.VERSION])
  ) {
    return {
      ok: false,
      error:
        `manifest selects '${CHECK_NAME.METHODOLOGY_CONTEXT}' but carries incomplete '${DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY}'`,
    };
  }

  const methodology = validateMethodologyConfig(methodologyValue);
  if (!methodology.ok) {
    return { ok: false, error: `manifest '${DIAGNOSE_MANIFEST_FIELDS.METHODOLOGY}': ${methodology.error}` };
  }
  return methodology;
}

/**
 * Parses the raw manifest JSON and validates it into the typed contract against
 * the checks available in this build. A manifest naming a check absent from
 * `availableChecks` is rejected, as is one that selects a check without that
 * check's required consumer facts: `spx-reachability` requires `spx_floor` and
 * `methodology-context` requires `methodology`. Fields outside the caller-fact
 * contract are rejected.
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
  const unknownFields = Object.keys(parsed).filter((field) => !DIAGNOSE_MANIFEST_FIELD_SET.has(field));
  if (unknownFields.length > 0) {
    return { ok: false, error: `manifest has unrecognized fields: ${unknownFields.join(", ")}` };
  }

  const checks = validateChecks(parsed[DIAGNOSE_MANIFEST_FIELDS.CHECKS], new Set(availableChecks));
  if (!checks.ok) return checks;

  const manifest: {
    spxFloor?: string;
    checks: readonly CheckName[];
    methodology?: MethodologyConfig;
  } = { checks: checks.value };

  const methodology = validateManifestMethodology(parsed, checks.value);
  if (!methodology.ok) return methodology;
  manifest.methodology = methodology.value;

  if (checks.value.includes(CHECK_NAME.SPX_REACHABILITY)) {
    const spxFloor = parsed[DIAGNOSE_MANIFEST_FIELDS.SPX_FLOOR];
    if (!isNonEmptyString(spxFloor)) {
      return {
        ok: false,
        error:
          `manifest selects '${CHECK_NAME.SPX_REACHABILITY}' but carries no '${DIAGNOSE_MANIFEST_FIELDS.SPX_FLOOR}'`,
      };
    }
    manifest.spxFloor = spxFloor;
  }

  return { ok: true, value: manifest };
}
