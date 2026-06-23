/**
 * Normalizes an unknown thrown value to a human-readable message: an Error's
 * own message, a string verbatim, or a best-effort serialization of anything
 * else. The serialization prefers JSON so an object renders its fields rather
 * than the default object string, and falls back to a `[type]` label when JSON
 * yields no string (for `undefined`, a function, or a symbol) or throws (on a
 * circular value), so the result is always a string and the call never throws.
 */
export function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const fallback = `[${typeof error}]`;
  try {
    const serialized = JSON.stringify(error);
    return typeof serialized === "string" ? serialized : fallback;
  } catch {
    return fallback;
  }
}
