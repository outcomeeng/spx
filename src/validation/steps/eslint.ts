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
import { DEFAULT_ESLINT_CONFIG_FILE, ESLINT_COMMAND_TOKENS, ESLINT_LOCAL_BIN_SEGMENTS } from "./eslint-contract";
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
  validatedFileIgnorePatterns?: readonly string[];
  mode?: ExecutionMode;
  configFile?: string;
  scope: ValidationScope;
  scopeConfig?: ScopeConfig;
}): string[] {
  const {
    validatedFiles,
    validatedFileIgnorePatterns = [],
    mode,
    configFile = DEFAULT_ESLINT_CONFIG_FILE,
    scope,
    scopeConfig,
  } = context;
  const fixArg = mode === EXECUTION_MODES.WRITE ? [ESLINT_COMMAND_TOKENS.FIX_FLAG] : [];

  if (validatedFiles && validatedFiles.length > 0) {
    // Explicit file scope is already the caller's narrowed target and takes
    // precedence over broad validation scope selection.
    return [
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      configFile,
      ...fixArg,
      ...buildIgnorePatternArgs(validatedFileIgnorePatterns),
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      ...validatedFiles,
    ];
  }
  const targetArgs = scope === VALIDATION_SCOPES.PRODUCTION || scopeConfig?.filteredByValidationPathIncludes
    ? buildProductionTargetArgs(scopeConfig)
    : buildCurrentDirectoryTargetArgs(scopeConfig);
  return [
    ESLINT_COMMAND_TOKENS.COMMAND,
    ...targetArgs,
    ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
    configFile,
    ...fixArg,
  ];
}

function buildCurrentDirectoryTargetArgs(scopeConfig: ScopeConfig | undefined): string[] {
  return [
    ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
    ...(scopeConfig?.filteredByValidationPaths ? buildIgnorePatternArgs(scopeConfig.excludePatterns) : []),
  ];
}

function buildProductionTargetArgs(scopeConfig: ScopeConfig | undefined): string[] {
  const targetPatterns = scopeConfig?.filePatterns.length
    ? scopeConfig.filePatterns
    : [ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY];
  return [
    ...targetPatterns,
    ...buildIgnorePatternArgs(scopeConfig?.excludePatterns ?? []),
  ];
}

function buildIgnorePatternArgs(patterns: readonly string[]): string[] {
  return patterns.flatMap((pattern) => [ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG, pattern]);
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
  output?: string;
  error?: string;
  skipped?: boolean;
}> {
  const { productDir, scope, validatedFiles, mode, eslintConfigFile, toolPath } = context;
  const lintPolicy = validateLintPolicy(productDir);

  if (!lintPolicy.ok) {
    return { success: false, error: lintPolicy.error };
  }

  if (context.scopeConfig.filteredByValidationPathNoMatches) {
    return { success: true, skipped: true };
  }

  const eslintArgs = buildEslintArgs({
    validatedFiles,
    validatedFileIgnorePatterns: context.validatedFileIgnorePatterns,
    mode,
    configFile: eslintConfigFile,
    scope,
    scopeConfig: context.scopeConfig,
  });

  return new Promise((resolve) => {
    const localBin = join(productDir, ...ESLINT_LOCAL_BIN_SEGMENTS);
    const binary = toolPath ?? (existsSync(localBin) ? localBin : "npx");
    const spawnArgs = binary === "npx" ? eslintArgs : eslintArgs.slice(1);
    const eslintProcess = spawnManagedSubprocess(runner, binary, spawnArgs, {
      cwd: productDir,
    });
    const chunks: string[] = [];
    const capture = (chunk: string | Uint8Array): void => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    };
    eslintProcess.stdout?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    eslintProcess.stderr?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    forwardValidationSubprocessOutput(eslintProcess, outputStreams);

    eslintProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      const output = chunks.join("");
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, output, error: `ESLint exited with code ${code}` });
      }
    });

    eslintProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      resolve({ success: false, output: chunks.join(""), error: error.message });
    });
  });
}
