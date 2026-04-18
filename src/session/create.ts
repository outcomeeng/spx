/**
 * Session creation utilities.
 *
 * @module session/create
 */

/**
 * Minimum content length for a valid session.
 */
export const MIN_CONTENT_LENGTH = 1;

/**
 * Result of session content validation.
 */
export interface ValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validates session content before creation.
 *
 * @param content - Raw session content
 * @returns Validation result with valid flag and optional error
 *
 * @example
 * ```typescript
 * const result = validateSessionContent('# My Session');
 * // => { valid: true }
 *
 * const result = validateSessionContent('');
 * // => { valid: false, error: 'Session content cannot be empty' }
 * ```
 */
export function validateSessionContent(content: string): ValidationResult {
  if (!content || content.trim().length < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      error: "Session content cannot be empty",
    };
  }

  return { valid: true };
}
