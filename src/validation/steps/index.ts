/**
 * Validation steps module.
 *
 * Exports individual validation steps and their supporting functions.
 *
 * @module validation/steps
 */

// Constants
export * from "./constants.js";

// Step implementations
export * from "./circular.js";
export * from "./eslint.js";
export * from "./knip.js";
export * from "./markdown.js";
export * from "./typescript.js";

// Re-export step definitions for easy access
import { circularDependencyStep } from "./circular.js";
import { eslintStep } from "./eslint.js";
import { knipStep } from "./knip.js";
import { typescriptStep } from "./typescript.js";

/**
 * All validation steps in execution order.
 *
 * The order is:
 * 1. Circular dependencies (fastest, catches structural issues)
 * 2. Knip (optional, catches unused code)
 * 3. ESLint (catches style and common issues)
 * 4. TypeScript (slowest, catches type errors)
 */
export const VALIDATION_STEPS = [
  circularDependencyStep,
  knipStep,
  eslintStep,
  typescriptStep,
] as const;
