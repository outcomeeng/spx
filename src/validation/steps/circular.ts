/**
 * Circular dependency validation step.
 *
 * Uses madge to detect circular imports in the codebase.
 *
 * @module validation/steps/circular
 */

import madge from "madge";
import { join } from "node:path";

import { TSCONFIG_FILES } from "../config/scope";
import type { CircularDependencyResult, ScopeConfig, ValidationScope } from "../types";

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

export const CIRCULAR_DEPS_KEYS = {
  MADGE: "madge",
} as const;

export type CircularDependencyGraphRunner = CircularDeps[typeof CIRCULAR_DEPS_KEYS.MADGE];

/**
 * Default production dependencies.
 */
export const defaultCircularDeps: CircularDeps = {
  [CIRCULAR_DEPS_KEYS.MADGE]: madge,
};

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate circular dependencies using TypeScript-derived scope.
 *
 * @param scope - Validation scope
 * @param typescriptScope - Scope configuration from tsconfig
 * @param projectRoot - Project root for Madge input and tsconfig resolution
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
  projectRoot: string,
  deps: CircularDeps = defaultCircularDeps,
): Promise<CircularDependencyResult> {
  try {
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories.map((directory) => join(projectRoot, directory));

    if (analyzeDirectories.length === 0) {
      return { success: true };
    }

    // Use the appropriate TypeScript config based on scope
    const tsConfigFile = join(projectRoot, TSCONFIG_FILES[scope]);

    // Convert tsconfig exclude patterns to madge excludeRegExp
    const excludeRegExps = typescriptScope.excludePatterns.map((pattern) => {
      // Remove trailing /**/* or /* for cleaner matching
      const cleanPattern = pattern.replace(/\/\*\*?\/\*$/, "");
      // Escape regex special chars and create regex
      const escaped = cleanPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped);
    });

    const result = await deps.madge(analyzeDirectories, {
      baseDir: projectRoot,
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
