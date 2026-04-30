/**
 * ESLint validation step.
 *
 * Validates code against ESLint rules with automatic TypeScript scope alignment.
 *
 * @module validation/steps/eslint
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExecutionMode, ProcessRunner, ValidationContext } from "../types";
import { EXECUTION_MODES, VALIDATION_SCOPES } from "../types";

import { CACHE_PATHS } from "./constants";

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
export const ESLINT_COMMAND_TOKENS = {
  CACHE_FLAG: "--cache",
  CACHE_LOCATION_FLAG: "--cache-location",
  COMMAND: "eslint",
  CONFIG_FLAG: "--config",
  CURRENT_DIRECTORY: ".",
  FILE_SEPARATOR: "--",
  FIX_FLAG: "--fix",
} as const;

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
  const fixArg = mode === EXECUTION_MODES.WRITE ? [ESLINT_COMMAND_TOKENS.FIX_FLAG] : [];
  const cacheArgs = [
    ESLINT_COMMAND_TOKENS.CACHE_FLAG,
    ESLINT_COMMAND_TOKENS.CACHE_LOCATION_FLAG,
    cacheFile,
  ];

  if (validatedFiles && validatedFiles.length > 0) {
    return [
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      configFile,
      ...cacheArgs,
      ...fixArg,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      ...validatedFiles,
    ];
  }
  return [
    ESLINT_COMMAND_TOKENS.COMMAND,
    ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
    ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
    configFile,
    ...cacheArgs,
    ...fixArg,
  ];
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
  const { projectRoot, scope, validatedFiles, mode, eslintConfigFile } = context;

  return new Promise((resolve) => {
    if (!validatedFiles || validatedFiles.length === 0) {
      if (scope === VALIDATION_SCOPES.PRODUCTION) {
        process.env.ESLINT_PRODUCTION_ONLY = "1";
      } else {
        delete process.env.ESLINT_PRODUCTION_ONLY;
      }
    }

    const eslintArgs = buildEslintArgs({
      validatedFiles,
      mode,
      cacheFile: CACHE_PATHS.ESLINT,
      configFile: eslintConfigFile,
    });

    const localBin = join(projectRoot, "node_modules", ".bin", "eslint");
    const binary = existsSync(localBin) ? localBin : "npx";
    const spawnArgs = binary === "npx" ? eslintArgs : eslintArgs.slice(1);
    const eslintProcess = runner.spawn(binary, spawnArgs, {
      cwd: projectRoot,
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
