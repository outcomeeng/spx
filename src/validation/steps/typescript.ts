/**
 * TypeScript validation step.
 *
 * Validates TypeScript code using the tsc compiler.
 *
 * @module validation/steps/typescript
 */

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { TSCONFIG_FILES } from "../config/scope";
import type { ScopeConfig, ValidationScope } from "../types";
import { VALIDATION_SCOPES } from "../types";
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
 * Default production process runner for TypeScript.
 */
export const defaultTypeScriptProcessRunner: ProcessRunner = lifecycleProcessRunner;

/**
 * Dependencies for file-specific TypeScript validation.
 */
export interface TypeScriptDeps {
  mkdtemp: typeof mkdtemp;
  writeFileSync: typeof writeFileSync;
  rmSync: typeof rmSync;
  existsSync: typeof existsSync;
}

/**
 * Default production dependencies.
 */
export const defaultTypeScriptDeps: TypeScriptDeps = {
  mkdtemp,
  writeFileSync,
  rmSync,
  existsSync,
};

export interface TypeScriptValidationContext {
  readonly scope: ValidationScope;
  readonly projectRoot: string;
  readonly files?: readonly string[];
  readonly scopeConfig?: ScopeConfig;
}

export interface TypeScriptValidationOptions {
  readonly runner?: ProcessRunner;
  readonly deps?: TypeScriptDeps;
  readonly outputStreams?: ValidationSubprocessOutputStreams;
}

/**
 * Compiler options for a temporary `tsconfig.json`; all else is inherited via `extends`.
 */
const TEMPORARY_TSCONFIG_COMPILER_OPTIONS = { noEmit: true } as const;

/**
 * Directory-name prefix for temporary validation configs, created inside the project root.
 */
const TEMPORARY_TSCONFIG_DIR_PREFIX = ".spx-validate-ts-";

// =============================================================================
// PURE ARGUMENT BUILDER
// =============================================================================

/**
 * Build TypeScript CLI arguments based on validation scope.
 *
 * Pure function for testability - can be verified at Level 1.
 *
 * @param context - Context for building arguments
 * @returns Array of tsc CLI arguments
 *
 * @example
 * ```typescript
 * const args = buildTypeScriptArgs({ scope: "full", configFile: "tsconfig.json" });
 * // Returns: ["tsc", "--noEmit"]
 * ```
 */
export function buildTypeScriptArgs(context: { scope: ValidationScope; configFile: string }): string[] {
  const { scope, configFile } = context;
  return scope === VALIDATION_SCOPES.FULL ? ["tsc", "--noEmit"] : ["tsc", "--project", configFile];
}

// =============================================================================
// FILE-SPECIFIC VALIDATION SUPPORT
// =============================================================================

/**
 * Create a temporary TypeScript configuration file for file-specific validation.
 *
 * @param scope - Validation scope
 * @param files - Files to validate
 * @param deps - Injectable dependencies
 * @returns Config path and cleanup function
 */
export async function createFileSpecificTsconfig(
  scope: ValidationScope,
  files: readonly string[],
  projectRoot: string,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  // Create temporary directory
  const tempDir = await deps.mkdtemp(join(projectRoot, TEMPORARY_TSCONFIG_DIR_PREFIX));
  const configPath = join(tempDir, "tsconfig.json");

  // Get base config file
  const baseConfigFile = TSCONFIG_FILES[scope];

  // Ensure all file paths are absolute
  const absoluteFiles = files.map((file) => (isAbsolute(file) ? file : join(projectRoot, file)));

  // Create temporary tsconfig that extends the base config
  const tempConfig = {
    extends: join(projectRoot, baseConfigFile),
    files: absoluteFiles,
    include: [],
    exclude: [],
    compilerOptions: TEMPORARY_TSCONFIG_COMPILER_OPTIONS,
  };

  // Write temporary config
  deps.writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));

  // Return config path and cleanup function
  const cleanup = () => {
    try {
      deps.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup error - don't fail validation
    }
  };

  return { configPath, tempDir, cleanup };
}

async function createScopeFilteredTsconfig(
  scope: ValidationScope,
  projectRoot: string,
  scopeConfig: ScopeConfig,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  const tempDir = await deps.mkdtemp(join(projectRoot, TEMPORARY_TSCONFIG_DIR_PREFIX));
  const configPath = join(tempDir, "tsconfig.json");
  const baseConfigFile = TSCONFIG_FILES[scope];
  const toProjectPathPattern = (pattern: string) => isAbsolute(pattern) ? pattern : join(projectRoot, pattern);
  const tempConfig = {
    extends: join(projectRoot, baseConfigFile),
    include: scopeConfig.filePatterns.map(toProjectPathPattern),
    exclude: scopeConfig.excludePatterns.map(toProjectPathPattern),
    compilerOptions: TEMPORARY_TSCONFIG_COMPILER_OPTIONS,
  };

  deps.writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));

  const cleanup = () => {
    try {
      deps.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup error - don't fail validation
    }
  };

  return { configPath, tempDir, cleanup };
}

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate TypeScript using authoritative configuration.
 *
 * @param context - Validation scope, project root, files, and optional path-filtered scope
 * @param options - Injectable process runner, filesystem dependencies, and output streams
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateTypeScript({ scope: "full", projectRoot });
 * if (!result.success) {
 *   console.error("TypeScript failed:", result.error);
 * }
 * ```
 */
export async function validateTypeScript(
  context: TypeScriptValidationContext,
  options: TypeScriptValidationOptions = {},
): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
}> {
  const { scope, projectRoot, files, scopeConfig } = context;
  const {
    runner = defaultTypeScriptProcessRunner,
    deps = defaultTypeScriptDeps,
    outputStreams = defaultValidationSubprocessOutputStreams,
  } = options;
  const configFile = TSCONFIG_FILES[scope];

  // Determine tool and arguments based on whether specific files are provided
  let tool: string;
  let tscArgs: string[];

  if (files && files.length > 0) {
    // File-specific validation using custom temporary tsconfig
    const { configPath, cleanup } = await createFileSpecificTsconfig(scope, files, projectRoot, deps);

    try {
      return await new Promise((resolve) => {
        const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
        const tscBinary = deps.existsSync(tscBin) ? tscBin : "npx";
        const tscArgs = tscBinary === "npx" ? ["tsc", "--project", configPath] : ["--project", configPath];
        const tscProcess = spawnManagedSubprocess(runner, tscBinary, tscArgs, {
          cwd: projectRoot,
        });
        forwardValidationSubprocessOutput(tscProcess, outputStreams);

        tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
          cleanup();
          if (code === 0) {
            resolve({ success: true, skipped: false });
          } else {
            resolve({ success: false, error: `TypeScript exited with code ${code}` });
          }
        });

        tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
          cleanup();
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create temporary config: ${errorMessage}` };
    }
  } else if (scopeConfig?.filteredByValidationPaths) {
    if (scopeConfig.filteredByValidationPathNoMatches) {
      return { success: true, skipped: true };
    }
    if (scopeConfig.filePatterns.length === 0 && scopeConfig.directories.length === 0) {
      return { success: true, skipped: true };
    }
    const { configPath, cleanup } = await createScopeFilteredTsconfig(scope, projectRoot, scopeConfig, deps);
    const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
    tool = deps.existsSync(tscBin) ? tscBin : "npx";
    tscArgs = tool === "npx" ? ["tsc", "--project", configPath] : ["--project", configPath];
    return new Promise((resolve) => {
      const tscProcess = spawnManagedSubprocess(runner, tool, tscArgs, {
        cwd: projectRoot,
      });
      forwardValidationSubprocessOutput(tscProcess, outputStreams);

      tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
        cleanup();
        if (code === 0) {
          resolve({ success: true, skipped: false });
        } else {
          resolve({ success: false, error: `TypeScript exited with code ${code}` });
        }
      });

      tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
        cleanup();
        resolve({ success: false, error: error.message });
      });
    });
  } else {
    // Full validation using tsc
    const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
    tool = deps.existsSync(tscBin) ? tscBin : "npx";
    const rawArgs = buildTypeScriptArgs({ scope, configFile });
    tscArgs = tool === "npx" ? rawArgs : rawArgs.slice(1);
  }

  return new Promise((resolve) => {
    const tscProcess = spawnManagedSubprocess(runner, tool, tscArgs, {
      cwd: projectRoot,
    });
    forwardValidationSubprocessOutput(tscProcess, outputStreams);

    tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      if (code === 0) {
        resolve({ success: true, skipped: false });
      } else {
        resolve({ success: false, error: `TypeScript exited with code ${code}` });
      }
    });

    tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}
