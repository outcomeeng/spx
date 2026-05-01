/**
 * TypeScript validation step.
 *
 * Validates TypeScript code using the tsc compiler.
 *
 * @module validation/steps/typescript
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { TSCONFIG_FILES } from "../config/scope";
import type { ProcessRunner, ScopeConfig, ValidationScope } from "../types";
import { VALIDATION_SCOPES } from "../types";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for TypeScript.
 */
export const defaultTypeScriptProcessRunner: ProcessRunner = { spawn };

/**
 * Dependencies for file-specific TypeScript validation.
 */
export interface TypeScriptDeps {
  mkdtemp: typeof mkdtemp;
  writeFileSync: typeof writeFileSync;
  rmSync: typeof rmSync;
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
}

/**
 * Default production dependencies.
 */
export const defaultTypeScriptDeps: TypeScriptDeps = {
  mkdtemp,
  writeFileSync,
  rmSync,
  existsSync,
  mkdirSync,
};

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
  files: string[],
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  // Create temporary directory
  const tempDir = await deps.mkdtemp(join(tmpdir(), "validate-ts-"));
  const configPath = join(tempDir, "tsconfig.json");

  // Get base config file
  const baseConfigFile = TSCONFIG_FILES[scope];

  // Ensure all file paths are absolute
  const projectRoot = process.cwd();
  const absoluteFiles = files.map((file) => (isAbsolute(file) ? file : join(projectRoot, file)));

  // Create temporary tsconfig that extends the base config
  const tempConfig = {
    extends: join(projectRoot, baseConfigFile),
    files: absoluteFiles,
    include: [],
    exclude: [],
    compilerOptions: {
      noEmit: true,
      typeRoots: [join(projectRoot, "node_modules", "@types")],
      types: ["node"],
    },
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

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate TypeScript using authoritative configuration.
 *
 * @param scope - Validation scope
 * @param typescriptScope - Scope configuration from tsconfig
 * @param files - Optional specific files to validate
 * @param runner - Injectable process runner
 * @param deps - Injectable TypeScript dependencies
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateTypeScript("full", scopeConfig);
 * if (!result.success) {
 *   console.error("TypeScript failed:", result.error);
 * }
 * ```
 */
export async function validateTypeScript(
  scope: ValidationScope,
  typescriptScope: ScopeConfig,
  files?: string[],
  runner: ProcessRunner = defaultTypeScriptProcessRunner,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
}> {
  const configFile = TSCONFIG_FILES[scope];

  // Determine tool and arguments based on whether specific files are provided
  let tool: string;
  let tscArgs: string[];

  if (files && files.length > 0) {
    // File-specific validation using custom temporary tsconfig
    const { configPath, cleanup } = await createFileSpecificTsconfig(scope, files, deps);

    try {
      return await new Promise((resolve) => {
        const tscBin = join(process.cwd(), "node_modules", ".bin", "tsc");
        const tscBinary = existsSync(tscBin) ? tscBin : "npx";
        const tscArgs = tscBinary === "npx" ? ["tsc", "--project", configPath] : ["--project", configPath];
        const tscProcess = runner.spawn(tscBinary, tscArgs, {
          cwd: process.cwd(),
          stdio: "inherit",
        });

        tscProcess.on("close", (code) => {
          cleanup();
          if (code === 0) {
            resolve({ success: true, skipped: false });
          } else {
            resolve({ success: false, error: `TypeScript exited with code ${code}` });
          }
        });

        tscProcess.on("error", (error) => {
          cleanup();
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      cleanup();
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create temporary config: ${errorMessage}` };
    }
  } else {
    // Full validation using tsc
    const tscBin = join(process.cwd(), "node_modules", ".bin", "tsc");
    tool = existsSync(tscBin) ? tscBin : "npx";
    const rawArgs = buildTypeScriptArgs({ scope, configFile });
    tscArgs = tool === "npx" ? rawArgs : rawArgs.slice(1);
  }

  return new Promise((resolve) => {
    const tscProcess = runner.spawn(tool, tscArgs, {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    tscProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, skipped: false });
      } else {
        resolve({ success: false, error: `TypeScript exited with code ${code}` });
      }
    });

    tscProcess.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}
