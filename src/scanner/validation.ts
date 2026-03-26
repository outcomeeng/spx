/**
 * Validation functions for BSP (Behavior, Structure, Property) numbers
 */

/**
 * BSP number range constants
 */
export const MIN_BSP_NUMBER = 10;
export const MAX_BSP_NUMBER = 99;

/**
 * Check if a number is a valid BSP number
 *
 * @param n - Number to validate
 * @returns true if n is in range [10, 99], false otherwise
 *
 * @example
 * ```typescript
 * isValidBSPNumber(20)  // true
 * isValidBSPNumber(9)   // false
 * isValidBSPNumber(100) // false
 * ```
 */
export function isValidBSPNumber(n: number): boolean {
  return n >= MIN_BSP_NUMBER && n <= MAX_BSP_NUMBER;
}

/**
 * Validate a BSP number and throw if invalid
 *
 * @param n - Number to validate
 * @returns The validated number
 * @throws Error if the number is outside the valid range [10, 99]
 *
 * @example
 * ```typescript
 * validateBSPNumber(20)  // returns 20
 * validateBSPNumber(5)   // throws Error: "BSP number must be between 10 and 99, got 5"
 * ```
 */
export function validateBSPNumber(n: number): number {
  if (!isValidBSPNumber(n)) {
    throw new Error(
      `BSP number must be between ${MIN_BSP_NUMBER} and ${MAX_BSP_NUMBER}, got ${n}`,
    );
  }
  return n;
}
