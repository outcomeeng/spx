/**
 * Diagnose facts — the consumer-varying inputs the pipeline judges against and
 * their shared structural validators. The manifest contract and the `diagnose`
 * config descriptor both resolve through these primitives. Pure; no I/O.
 *
 * @module domains/diagnose/facts
 */

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
