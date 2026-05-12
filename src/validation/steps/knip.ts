/**
 * Knip validation step.
 *
 * Detects unused exports, dependencies, and files using knip.
 *
 * @module validation/steps/knip
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import type { ScopeConfig } from "../types";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for Knip.
 */
export const defaultKnipProcessRunner: ProcessRunner = lifecycleProcessRunner;

export interface KnipValidationContext {
  readonly projectRoot: string;
  readonly typescriptScope: ScopeConfig;
}

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate unused code using knip with TypeScript-derived scope.
 *
 * @param context - Knip validation context
 * @param runner - Injectable process runner
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateKnip({ projectRoot, typescriptScope: scopeConfig });
 * if (!result.success) {
 *   console.error("Knip found issues:", result.error);
 * }
 * ```
 */
export async function validateKnip(
  context: KnipValidationContext,
  runner: ProcessRunner = defaultKnipProcessRunner,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { projectRoot, typescriptScope } = context;
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories;

    if (analyzeDirectories.length === 0) {
      return { success: true };
    }

    return new Promise((resolve) => {
      const localBin = join(projectRoot, "node_modules", ".bin", "knip");
      const binary = existsSync(localBin) ? localBin : "npx";
      const knipProcess = spawnManagedSubprocess(runner, binary, binary === "npx" ? ["knip"] : [], {
        cwd: projectRoot,
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
