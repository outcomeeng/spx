/**
 * ESLint validation step.
 *
 * Validates code against ESLint rules with automatic TypeScript scope alignment.
 *
 * @module validation/steps/eslint
 */

import { spawn } from "node:child_process";

import type {
  ExecutionMode,
  ProcessRunner,
  ValidationContext,
  ValidationStep,
  ValidationStepResult,
} from "../types.js";
import { EXECUTION_MODES, VALIDATION_SCOPES } from "../types.js";

import { CACHE_PATHS, STEP_DESCRIPTIONS, STEP_IDS, STEP_NAMES, VALIDATION_KEYS } from "./constants.js";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for ESLint.
 */
export const defaultEslintProcessRunner: ProcessRunner = { spawn };

// =============================================================================
// PURE ARGUMENT BUILDER
// =============================================================================

/**
 * Default ESLint flat config file name, used when the caller does not supply
 * one. Callers should prefer passing the config file reported by language
 * detection.
 */
export const DEFAULT_ESLINT_CONFIG_FILE = "eslint.config.ts";

/**
 * Build ESLint CLI arguments based on validation context.
 *
 * Pure function for testability - can be verified at Level 1.
 *
 * @param context - Context for building arguments
 * @returns Array of ESLint CLI arguments
 *
 * @example
 * ```typescript
 * const args = buildEslintArgs({
 *   validatedFiles: ["src/index.ts"],
 *   mode: "write",
 *   cacheFile: "dist/.eslintcache",
 *   configFile: "eslint.config.ts",
 * });
 * // Returns: ["eslint", "--config", "eslint.config.ts", "--cache", ...]
 * ```
 */
export function buildEslintArgs(context: {
  validatedFiles?: string[];
  mode?: ExecutionMode;
  cacheFile: string;
  configFile?: string;
}): string[] {
  const { validatedFiles, mode, cacheFile, configFile = DEFAULT_ESLINT_CONFIG_FILE } = context;
  const fixArg = mode === EXECUTION_MODES.WRITE ? ["--fix"] : [];
  const cacheArgs = ["--cache", "--cache-location", cacheFile];

  if (validatedFiles && validatedFiles.length > 0) {
    return ["eslint", "--config", configFile, ...cacheArgs, ...fixArg, "--", ...validatedFiles];
  }
  return ["eslint", ".", "--config", configFile, ...cacheArgs, ...fixArg];
}

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate ESLint compliance using automatic TypeScript scope alignment.
 *
 * @param context - Validation context
 * @param runner - Injectable process runner
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateESLint(context);
 * if (!result.success) {
 *   console.error("ESLint failed:", result.error);
 * }
 * ```
 */
export async function validateESLint(
  context: ValidationContext,
  runner: ProcessRunner = defaultEslintProcessRunner,
): Promise<{
  success: boolean;
  error?: string;
}> {
  const { scope, validatedFiles, mode, eslintConfigFile } = context;

  return new Promise((resolve) => {
    // Set environment variable to control ESLint scope
    if (!validatedFiles || validatedFiles.length === 0) {
      if (scope === VALIDATION_SCOPES.PRODUCTION) {
        process.env.ESLINT_PRODUCTION_ONLY = "1";
      } else {
        delete process.env.ESLINT_PRODUCTION_ONLY;
      }
    }

    // Build ESLint arguments
    const eslintArgs = buildEslintArgs({
      validatedFiles,
      mode,
      cacheFile: CACHE_PATHS.ESLINT,
      configFile: eslintConfigFile,
    });

    const eslintProcess = runner.spawn("npx", eslintArgs, {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    eslintProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `ESLint exited with code ${code}` });
      }
    });

    eslintProcess.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

// =============================================================================
// ENVIRONMENT CHECK
// =============================================================================

/**
 * Check if a validation type is enabled via environment variable.
 *
 * @param envVarKey - Validation key (TYPESCRIPT, ESLINT, KNIP)
 * @param defaults - Default enabled states
 * @returns True if the validation is enabled
 */
export function validationEnabled(
  envVarKey: string,
  defaults: Record<string, boolean> = {},
): boolean {
  const envVar = `${envVarKey}_VALIDATION_ENABLED`;
  const explicitlyDisabled = process.env[envVar] === "0";
  const explicitlyEnabled = process.env[envVar] === "1";

  const defaultValue = defaults[envVarKey] ?? true;
  if (defaultValue) {
    return !explicitlyDisabled;
  }
  return explicitlyEnabled;
}

// =============================================================================
// VALIDATION STEP DEFINITION
// =============================================================================

/**
 * ESLint validation step.
 *
 * Enabled when ESLint validation is enabled in the context.
 */
export const eslintStep: ValidationStep = {
  id: STEP_IDS.ESLINT,
  name: STEP_NAMES.ESLINT,
  description: STEP_DESCRIPTIONS.ESLINT,
  enabled: (context: ValidationContext) =>
    context.enabledValidations[VALIDATION_KEYS.ESLINT] === true
    && validationEnabled(VALIDATION_KEYS.ESLINT),
  execute: async (context: ValidationContext): Promise<ValidationStepResult> => {
    const startTime = performance.now();
    try {
      const result = await validateESLint(context);
      return {
        success: result.success,
        error: result.error,
        duration: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: performance.now() - startTime,
      };
    }
  },
};
