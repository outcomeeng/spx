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

/** The marketplace identity a consumer depends on. */
export interface MarketplaceIdentity {
  readonly name: string;
  readonly source: string;
}

/** Whether the value is a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether the value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Whether the value is an array of non-empty strings. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

/** Validates a marketplace-identity value, labelling errors with the supplied field path. */
export function validateMarketplaceIdentity(value: unknown, field: string): Result<MarketplaceIdentity> {
  if (!isRecord(value) || !isNonEmptyString(value.name) || !isNonEmptyString(value.source)) {
    return { ok: false, error: `${field} must carry a non-empty \`name\` and \`source\`` };
  }
  return { ok: true, value: { name: value.name, source: value.source } };
}
