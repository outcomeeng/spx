/**
 * Diagnose config descriptor — the `diagnose` section of `spx.config` carrying
 * the diagnostic facts a user-mode run judges against: the spx-version floor,
 * the spx-version floor and check set. Every field is optional; an omitted fact
 * falls back to a per-check safe default at
 * resolution time.
 * Structural validation only; the engine resolves and judges the facts.
 *
 * @module domains/diagnose/config
 */

import type { ConfigDescriptor, Result } from "@/config/types";
import { isNonEmptyString, isNonEmptyStringArray } from "@/domains/diagnose/facts";

export const DIAGNOSE_SECTION = "diagnose";

export const DIAGNOSE_CONFIG_FIELDS = {
  SPX_FLOOR: "spxFloor",
  CHECKS: "checks",
} as const;

/** The diagnostic facts declared in the `spx.config` diagnose section; each is optional and resolves to a safe default when absent. */
export interface DiagnoseConfig {
  readonly spxFloor?: string;
  readonly checks?: readonly string[];
}

const defaults: DiagnoseConfig = {};
const DIAGNOSE_CONFIG_FIELD_SET: ReadonlySet<string> = new Set(Object.values(DIAGNOSE_CONFIG_FIELDS));

function validate(value: unknown): Result<DiagnoseConfig> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: `${DIAGNOSE_SECTION} section must be an object` };
  }
  const candidate = value as Record<string, unknown>;
  const unknownFields = Object.keys(candidate).filter((field) => !DIAGNOSE_CONFIG_FIELD_SET.has(field));
  if (unknownFields.length > 0) {
    return { ok: false, error: `${DIAGNOSE_SECTION} has unrecognized fields: ${unknownFields.join(", ")}` };
  }
  const resolved: {
    spxFloor?: string;
    checks?: readonly string[];
  } = {};

  const spxFloor = candidate[DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR];
  if (spxFloor !== undefined) {
    if (!isNonEmptyString(spxFloor)) {
      return { ok: false, error: `${DIAGNOSE_SECTION}.${DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR} must be a non-empty string` };
    }
    resolved.spxFloor = spxFloor;
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
