/**
 * Circular dependency validation step.
 *
 * Uses madge to detect circular imports in the codebase.
 *
 * @module validation/steps/circular
 */

import madge from "madge";

import { TSCONFIG_FILES } from "../config/scope.js";
import type { CircularDependencyResult, ScopeConfig, ValidationScope } from "../types.js";

// =============================================================================
// DEPENDENCY INJECTION INTERFACES
// =============================================================================

/**
 * Dependencies for circular dependency validation.
 *
 * Enables dependency injection for testing.
 */
export interface CircularDeps {
  madge: typeof madge;
}

/**
 * Default production dependencies.
 */
export const defaultCircularDeps: CircularDeps = {
  madge,
};

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate circular dependencies using TypeScript-derived scope.
 *
 * @param scope - Validation scope
 * @param typescriptScope - Scope configuration from tsconfig
 * @param deps - Injectable dependencies
 * @returns Result with success status and any circular dependencies found
 *
 * @example
 * ```typescript
 * const result = await validateCircularDependencies("full", scopeConfig);
 * if (!result.success) {
 *   console.error("Found circular dependencies:", result.circularDependencies);
 * }
 * ```
 */
export async function validateCircularDependencies(
  scope: ValidationScope,
  typescriptScope: ScopeConfig,
  deps: CircularDeps = defaultCircularDeps,
): Promise<CircularDependencyResult> {
  try {
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories;

    if (analyzeDirectories.length === 0) {
      return { success: true };
    }

    // Use the appropriate TypeScript config based on scope
    const tsConfigFile = TSCONFIG_FILES[scope];

    // Convert tsconfig exclude patterns to madge excludeRegExp
    const excludeRegExps = typescriptScope.excludePatterns.map((pattern) => {
      // Remove trailing /**/* or /* for cleaner matching
      const cleanPattern = pattern.replace(/\/\*\*?\/\*$/, "");
      // Escape regex special chars and create regex
      const escaped = cleanPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped);
    });

    const result = await deps.madge(analyzeDirectories, {
      fileExtensions: ["ts", "tsx"],
      tsConfig: tsConfigFile,
      excludeRegExp: excludeRegExps,
    });

    const circular = result.circular();

    if (circular.length === 0) {
      return { success: true };
    } else {
      return {
        success: false,
        error: `Found ${circular.length} circular dependency cycle(s)`,
        circularDependencies: circular,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
