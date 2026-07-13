/**
 * Diagnose facts — the consumer-varying inputs the pipeline judges against and
 * their shared structural validators. The manifest contract and the `diagnose`
 * config descriptor both resolve to these facts, so the marketplace, plugin, and
 * string-array shapes validate through one source rather than each surface
 * redeclaring them. Pure; no I/O.
 *
 * @module domains/diagnose/facts
 */

import type { Result } from "@/config/types";

/** Runtime field vocabulary for a consumer's marketplace identity. */
export const MARKETPLACE_IDENTITY_FIELDS = {
  NAME: "name",
  SOURCE: "source",
} as const;

/** The marketplace identity a consumer depends on. */
export interface MarketplaceIdentity {
  readonly [MARKETPLACE_IDENTITY_FIELDS.NAME]: string;
  readonly [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: string;
}

/** Whether the value is a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether the value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Whether the value is a non-empty array of non-empty strings. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/** Validates a marketplace-identity value, labelling errors with the supplied field path. */
export function validateMarketplaceIdentity(value: unknown, field: string): Result<MarketplaceIdentity> {
  const record = isRecord(value) ? value : undefined;
  const name = record?.[MARKETPLACE_IDENTITY_FIELDS.NAME];
  const source = record?.[MARKETPLACE_IDENTITY_FIELDS.SOURCE];
  if (
    !isNonEmptyString(name)
    || !isNonEmptyString(source)
  ) {
    return { ok: false, error: `${field} must carry a non-empty \`name\` and \`source\`` };
  }
  return {
    ok: true,
    value: {
      [MARKETPLACE_IDENTITY_FIELDS.NAME]: name,
      [MARKETPLACE_IDENTITY_FIELDS.SOURCE]: source,
    },
  };
}
