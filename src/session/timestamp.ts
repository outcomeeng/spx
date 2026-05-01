/**
 * Session timestamp utilities for generating and parsing session IDs.
 *
 * Session IDs use the format YYYY-MM-DD_HH-mm-ss.
 *
 * @module session/timestamp
 */

/**
 * Regular expression pattern for validating session IDs.
 * Format: YYYY-MM-DD_HH-mm-ss (all components zero-padded)
 *
 * Exported for use in validation and testing.
 */
export const SESSION_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;

/**
 * Separator between date and time components in session IDs.
 */
export const SESSION_ID_SEPARATOR = "_";

/**
 * Options for generating session IDs.
 */
export interface GenerateSessionIdOptions {
  /**
   * Function that returns the current time.
   * Defaults to `() => new Date()` for production use.
   * Injectable for deterministic testing.
   */
  now?: () => Date;
}

/**
 * Generates a session ID from the current (or injected) time.
 *
 * @param options - Optional configuration including time source
 * @returns Session ID in format YYYY-MM-DD_HH-mm-ss
 *
 * @example
 * ```typescript
 * // Production usage
 * const id = generateSessionId();
 * // => "2026-01-13_08-01-05"
 *
 * // Testing with injected time
 * const id = generateSessionId({ now: () => new Date('2026-01-13T08:01:05') });
 * // => "2026-01-13_08-01-05"
 * ```
 */
export function generateSessionId(options: GenerateSessionIdOptions = {}): string {
  const now = options.now ?? (() => new Date());
  const date = now();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}${SESSION_ID_SEPARATOR}${hours}-${minutes}-${seconds}`;
}

/**
 * Parses a session ID string back into a Date object.
 *
 * @param id - Session ID string to parse
 * @returns Date object if valid, null if invalid format
 *
 * @example
 * ```typescript
 * const date = parseSessionId('2026-01-13_08-01-05');
 * // => Date representing 2026-01-13T08:01:05 (local time)
 *
 * const invalid = parseSessionId('invalid-format');
 * // => null
 * ```
 */
export function parseSessionId(id: string): Date | null {
  const match = SESSION_ID_PATTERN.exec(id);

  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr, hoursStr, minutesStr, secondsStr] = match;

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // Date months are 0-indexed
  const day = parseInt(dayStr, 10);
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  const seconds = parseInt(secondsStr, 10);

  // Validate component ranges
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (seconds < 0 || seconds > 59) return null;

  return new Date(year, month, day, hours, minutes, seconds);
}
