/**
 * TypeScript validation step.
 *
 * Validates TypeScript code using the tsc compiler.
 *
 * @module validation/steps/typescript
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { TEMPORARY_TSCONFIG_PARENT_SEGMENTS, TSCONFIG_FILES } from "../config/scope";
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
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  rmSync: typeof rmSync;
  existsSync: typeof existsSync;
}

/**
 * Default production dependencies.
 */
export const defaultTypeScriptDeps: TypeScriptDeps = {
  mkdtemp,
  mkdirSync,
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

export interface TypeScriptValidationResult {
  readonly success: boolean;
  readonly error?: string;
  readonly skipped?: boolean;
}

interface TypeScriptCommandInvocation {
  readonly tool: string;
  readonly args: readonly string[];
}

/**
 * Compiler options for a temporary `tsconfig.json`; all else is inherited via `extends`.
 */
const TEMPORARY_TSCONFIG_COMPILER_OPTIONS = { noEmit: true } as const;

/**
 * Directory-name prefix for temporary validation configs.
 */
const TEMPORARY_TSCONFIG_DIR_PREFIX = "validate-ts-";

/**
 * Create the temporary directory that holds one validation `tsconfig.json`.
 */
async function createTemporaryTsconfigDir(projectRoot: string, deps: TypeScriptDeps): Promise<string> {
  const parent = join(projectRoot, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS);
  deps.mkdirSync(parent, { recursive: true });
  return deps.mkdtemp(join(parent, TEMPORARY_TSCONFIG_DIR_PREFIX));
}

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
  const tempDir = await createTemporaryTsconfigDir(projectRoot, deps);
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

  const cleanup = createTemporaryTsconfigCleanup(tempDir, deps);

  return { configPath, tempDir, cleanup };
}

async function createScopeFilteredTsconfig(
  scope: ValidationScope,
  projectRoot: string,
  scopeConfig: ScopeConfig,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  const tempDir = await createTemporaryTsconfigDir(projectRoot, deps);
  const configPath = join(tempDir, "tsconfig.json");
  const baseConfigFile = TSCONFIG_FILES[scope];
  const toTemporaryConfigPathPattern = (pattern: string) => {
    const absolutePattern = isAbsolute(pattern) ? pattern : join(projectRoot, pattern);
    return relative(tempDir, absolutePattern);
  };
  const tempConfig = {
    extends: join(projectRoot, baseConfigFile),
    include: scopeConfig.filePatterns.map(toTemporaryConfigPathPattern),
    exclude: scopeConfig.excludePatterns.map(toTemporaryConfigPathPattern),
    compilerOptions: TEMPORARY_TSCONFIG_COMPILER_OPTIONS,
  };

  deps.writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));

  const cleanup = createTemporaryTsconfigCleanup(tempDir, deps);

  return { configPath, tempDir, cleanup };
}

function createTemporaryTsconfigCleanup(tempDir: string, deps: TypeScriptDeps): () => void {
  return () => {
    try {
      deps.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup error - don't fail validation
    }
  };
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
): Promise<TypeScriptValidationResult> {
  const { scope, projectRoot, files, scopeConfig } = context;
  const {
    runner = defaultTypeScriptProcessRunner,
    deps = defaultTypeScriptDeps,
    outputStreams = defaultValidationSubprocessOutputStreams,
  } = options;
  const configFile = TSCONFIG_FILES[scope];

  if (files && files.length > 0) {
    const { configPath, cleanup } = await createFileSpecificTsconfig(scope, files, projectRoot, deps);
    try {
      return await runTypeScriptInvocation(
        projectRoot,
        resolveProjectTscInvocation(projectRoot, deps, ["--project", configPath]),
        runner,
        outputStreams,
        cleanup,
      );
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
    return runTypeScriptInvocation(
      projectRoot,
      resolveProjectTscInvocation(projectRoot, deps, ["--project", configPath]),
      runner,
      outputStreams,
      cleanup,
    );
  }

  return runTypeScriptInvocation(
    projectRoot,
    resolveProjectTscInvocation(projectRoot, deps, buildTypeScriptArgs({ scope, configFile }).slice(1)),
    runner,
    outputStreams,
  );
}

function resolveProjectTscInvocation(
  projectRoot: string,
  deps: TypeScriptDeps,
  tscArgs: readonly string[],
): TypeScriptCommandInvocation {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  const tool = deps.existsSync(tscBin) ? tscBin : "npx";
  return {
    tool,
    args: tool === "npx" ? ["tsc", ...tscArgs] : tscArgs,
  };
}

function runTypeScriptInvocation(
  projectRoot: string,
  invocation: TypeScriptCommandInvocation,
  runner: ProcessRunner,
  outputStreams: ValidationSubprocessOutputStreams,
  cleanup: () => void = () => {},
): Promise<TypeScriptValidationResult> {
  return new Promise((resolve) => {
    const tscProcess = spawnManagedSubprocess(runner, invocation.tool, invocation.args, {
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
}
