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

/** The wire keys of a marketplace identity, shared by the manifest and the `diagnose` config section. */
export const MARKETPLACE_IDENTITY_FIELDS = {
  NAME: "name",
  SOURCE: "source",
} as const;

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

/** Whether the value is a non-empty array of non-empty strings. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function marketplaceIdentityError(field: string): string {
  return `${field} must carry a non-empty \`${MARKETPLACE_IDENTITY_FIELDS.NAME}\` and \`${MARKETPLACE_IDENTITY_FIELDS.SOURCE}\``;
}

/** Validates a marketplace-identity value, labelling errors with the supplied field path. */
export function validateMarketplaceIdentity(value: unknown, field: string): Result<MarketplaceIdentity> {
  if (!isRecord(value)) return { ok: false, error: marketplaceIdentityError(field) };
  const name = value[MARKETPLACE_IDENTITY_FIELDS.NAME];
  const source = value[MARKETPLACE_IDENTITY_FIELDS.SOURCE];
  if (!isNonEmptyString(name) || !isNonEmptyString(source)) {
    return { ok: false, error: marketplaceIdentityError(field) };
  }
  return { ok: true, value: { name, source } };
}
