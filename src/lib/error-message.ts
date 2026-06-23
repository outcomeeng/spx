/**
 * Normalizes an unknown thrown value to a human-readable message: an Error's
 * own message, a string verbatim, or the JSON serialization of anything else.
 */
export function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}
