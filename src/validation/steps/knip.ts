/**
 * Knip validation step.
 *
 * Detects unused exports, dependencies, and files using knip.
 *
 * @module validation/steps/knip
 */

import { spawn } from "node:child_process";

import type { ProcessRunner, ScopeConfig } from "../types.js";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for Knip.
 */
export const defaultKnipProcessRunner: ProcessRunner = { spawn };

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate unused code using knip with TypeScript-derived scope.
 *
 * @param scope - Validation scope
 * @param typescriptScope - Scope configuration from tsconfig
 * @param runner - Injectable process runner
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateKnip("full", scopeConfig);
 * if (!result.success) {
 *   console.error("Knip found issues:", result.error);
 * }
 * ```
 */
export async function validateKnip(
  typescriptScope: ScopeConfig,
  runner: ProcessRunner = defaultKnipProcessRunner,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories;

    if (analyzeDirectories.length === 0) {
      return { success: true };
    }

    return new Promise((resolve) => {
      const knipProcess = runner.spawn("npx", ["knip"], {
        cwd: process.cwd(),
        stdio: "pipe",
      });

      let knipOutput = "";
      let knipError = "";

      knipProcess.stdout?.on("data", (data: Buffer) => {
        knipOutput += data.toString();
      });

      knipProcess.stderr?.on("data", (data: Buffer) => {
        knipError += data.toString();
      });

      knipProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          const errorOutput = knipOutput || knipError || "Unused code detected";
          resolve({
            success: false,
            error: errorOutput,
          });
        }
      });

      knipProcess.on("error", (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
