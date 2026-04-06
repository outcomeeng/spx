/**
 * Constants for validation steps.
 *
 * DRY constants that are verified in tests rather than using literal strings.
 *
 * @module validation/steps/constants
 */

/**
 * Step identifiers for validation steps.
 */
export const STEP_IDS = {
  CIRCULAR: "circular-deps",
  ESLINT: "eslint",
  TYPESCRIPT: "typescript",
  KNIP: "knip",
  MARKDOWN: "markdown",
} as const;

/**
 * Human-readable step names.
 */
export const STEP_NAMES = {
  CIRCULAR: "Circular Dependencies",
  ESLINT: "ESLint",
  TYPESCRIPT: "TypeScript",
  KNIP: "Unused Code",
  MARKDOWN: "Markdown",
} as const;

/**
 * Step descriptions shown during execution.
 */
export const STEP_DESCRIPTIONS = {
  CIRCULAR: "Checking for circular dependencies",
  ESLINT: "Validating ESLint compliance",
  TYPESCRIPT: "Validating TypeScript",
  KNIP: "Detecting unused exports, dependencies, and files",
  MARKDOWN: "Validating markdown link integrity and structure",
} as const;

/**
 * Cache file locations.
 */
export const CACHE_PATHS = {
  ESLINT: "dist/.eslintcache",
  TIMINGS: "dist/.validation-timings.json",
} as const;

/**
 * Validation type keys.
 */
export const VALIDATION_KEYS = {
  TYPESCRIPT: "TYPESCRIPT",
  ESLINT: "ESLINT",
  KNIP: "KNIP",
} as const;

/**
 * Default enabled state for each validation type.
 */
export const VALIDATION_DEFAULTS = {
  [VALIDATION_KEYS.TYPESCRIPT]: true,
  [VALIDATION_KEYS.ESLINT]: true,
  [VALIDATION_KEYS.KNIP]: false,
} as const;
