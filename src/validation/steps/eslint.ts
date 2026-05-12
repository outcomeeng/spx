/**
 * ESLint validation step.
 *
 * Validates code against ESLint rules with automatic TypeScript scope alignment.
 *
 * @module validation/steps/eslint
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { validateLintPolicy } from "@/validation/lint-policy";
import type { ExecutionMode, ScopeConfig, ValidationContext, ValidationScope } from "../types";
import { EXECUTION_MODES, VALIDATION_SCOPES } from "../types";
import {
  defaultValidationSubprocessOutputStreams,
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  type ValidationSubprocessOutputStreams,
} from "./subprocess-output";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for ESLint.
 */
export const defaultEslintProcessRunner: ProcessRunner = lifecycleProcessRunner;

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
  COMMAND: "eslint",
  CONFIG_FLAG: "--config",
  CURRENT_DIRECTORY: ".",
  FILE_SEPARATOR: "--",
  FIX_FLAG: "--fix",
  IGNORE_PATTERN_FLAG: "--ignore-pattern",
} as const;
export const ESLINT_LOCAL_BIN_SEGMENTS = ["node_modules", ".bin", ESLINT_COMMAND_TOKENS.COMMAND] as const;
export const ESLINT_EMPTY_PRODUCTION_SCOPE_ERROR = "ESLint production scope has no file patterns";

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
 *   configFile: "eslint.config.ts",
 * });
 * // Returns: ["eslint", "--config", "eslint.config.ts", "--", "src/index.ts"]
 * ```
 */
export function buildEslintArgs(context: {
  validatedFiles?: string[];
  mode?: ExecutionMode;
  configFile?: string;
  scope?: ValidationScope;
  scopeConfig?: ScopeConfig;
}): string[] {
  const { validatedFiles, mode, configFile = DEFAULT_ESLINT_CONFIG_FILE, scope, scopeConfig } = context;
  const fixArg = mode === EXECUTION_MODES.WRITE ? [ESLINT_COMMAND_TOKENS.FIX_FLAG] : [];

  if (validatedFiles && validatedFiles.length > 0) {
    // Explicit file scope is already the caller's narrowed target and takes
    // precedence over broad validation scope selection.
    return [
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      configFile,
      ...fixArg,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      ...validatedFiles,
    ];
  }
  const targetArgs = scope === VALIDATION_SCOPES.PRODUCTION
    ? buildProductionTargetArgs(scopeConfig)
    : [ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY];
  return [
    ESLINT_COMMAND_TOKENS.COMMAND,
    ...targetArgs,
    ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
    configFile,
    ...fixArg,
  ];
}

function buildProductionTargetArgs(scopeConfig: ScopeConfig | undefined): string[] {
  if (scopeConfig === undefined || scopeConfig.filePatterns.length === 0) {
    throw new Error(ESLINT_EMPTY_PRODUCTION_SCOPE_ERROR);
  }
  return [
    ...scopeConfig.filePatterns,
    ...scopeConfig.excludePatterns.flatMap((pattern) => [ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG, pattern]),
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
  outputStreams: ValidationSubprocessOutputStreams = defaultValidationSubprocessOutputStreams,
): Promise<{
  success: boolean;
  error?: string;
}> {
  const { projectRoot, scope, validatedFiles, mode, eslintConfigFile } = context;
  const lintPolicy = validateLintPolicy(projectRoot);

  if (!lintPolicy.ok) {
    return { success: false, error: lintPolicy.error };
  }

  let eslintArgs: string[];
  try {
    eslintArgs = buildEslintArgs({
      validatedFiles,
      mode,
      configFile: eslintConfigFile,
      scope,
      scopeConfig: context.scopeConfig,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  return new Promise((resolve) => {
    const localBin = join(projectRoot, ...ESLINT_LOCAL_BIN_SEGMENTS);
    const binary = existsSync(localBin) ? localBin : "npx";
    const spawnArgs = binary === "npx" ? eslintArgs : eslintArgs.slice(1);
    const eslintProcess = spawnManagedSubprocess(runner, binary, spawnArgs, {
      cwd: projectRoot,
    });
    forwardValidationSubprocessOutput(eslintProcess, outputStreams);

    eslintProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `ESLint exited with code ${code}` });
      }
    });

    eslintProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}
