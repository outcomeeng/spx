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
import {
  TEMPORARY_TSCONFIG_PARENT_SEGMENTS,
  TSCONFIG_FILES,
  TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX,
  TYPESCRIPT_SCOPE_PROJECT_ROOT,
} from "../config/scope";
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
  readonly productDir: string;
  readonly files?: readonly string[];
  readonly scopeConfig?: ScopeConfig;
}

export interface TypeScriptValidationOptions {
  readonly runner?: ProcessRunner;
  readonly deps?: TypeScriptDeps;
  readonly toolPath?: string;
  readonly outputStreams?: ValidationSubprocessOutputStreams;
}

export interface TypeScriptValidationResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly skipped?: boolean;
}

export function formatTypeScriptExitCodeError(code: number | null): string {
  return `TypeScript exited with code ${code}`;
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
async function createTemporaryTsconfigDir(productDir: string, deps: TypeScriptDeps): Promise<string> {
  const parent = join(productDir, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS);
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
  productDir: string,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  // Create temporary directory
  const tempDir = await createTemporaryTsconfigDir(productDir, deps);
  const configPath = join(tempDir, "tsconfig.json");

  // Get base config file
  const baseConfigFile = TSCONFIG_FILES[scope];

  // Ensure all file paths are absolute
  const absoluteFiles = files.map((file) => (isAbsolute(file) ? file : join(productDir, file)));

  // Create temporary tsconfig that extends the base config
  const tempConfig = {
    extends: join(productDir, baseConfigFile),
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
  productDir: string,
  scopeConfig: ScopeConfig,
  deps: TypeScriptDeps = defaultTypeScriptDeps,
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  const tempDir = await createTemporaryTsconfigDir(productDir, deps);
  const configPath = join(tempDir, "tsconfig.json");
  const baseConfigFile = TSCONFIG_FILES[scope];
  const toTemporaryConfigPathPattern = (pattern: string) => {
    const absolutePattern = isAbsolute(pattern) ? pattern : join(productDir, pattern);
    return relative(tempDir, absolutePattern);
  };
  const tempConfig = {
    extends: join(productDir, baseConfigFile),
    include: scopeConfigToTemporaryIncludes(scopeConfig).map(toTemporaryConfigPathPattern),
    exclude: scopeConfig.excludePatterns.map(toTemporaryConfigPathPattern),
    compilerOptions: TEMPORARY_TSCONFIG_COMPILER_OPTIONS,
  };

  deps.writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));

  const cleanup = createTemporaryTsconfigCleanup(tempDir, deps);

  return { configPath, tempDir, cleanup };
}

function scopeConfigToTemporaryIncludes(scopeConfig: ScopeConfig): string[] {
  return [
    ...new Set([
      ...scopeConfig.filePatterns,
      ...scopeConfig.directories.map(typeScriptDirectoryIncludePattern),
    ]),
  ];
}

function typeScriptDirectoryIncludePattern(directory: string): string {
  return directory === TYPESCRIPT_SCOPE_PROJECT_ROOT
    ? TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX.slice(1)
    : `${directory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`;
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
 * @param context - Validation scope, product directory, files, and optional path-filtered scope
 * @param options - Injectable process runner, filesystem dependencies, and output streams
 * @returns Promise resolving to validation result
 *
 * @example
 * ```typescript
 * const result = await validateTypeScript({ scope: "full", productDir });
 * if (!result.success) {
 *   console.error("TypeScript failed:", result.error);
 * }
 * ```
 */
export async function validateTypeScript(
  context: TypeScriptValidationContext,
  options: TypeScriptValidationOptions = {},
): Promise<TypeScriptValidationResult> {
  const { scope, productDir, files, scopeConfig } = context;
  const {
    runner = defaultTypeScriptProcessRunner,
    deps = defaultTypeScriptDeps,
    toolPath,
    outputStreams = defaultValidationSubprocessOutputStreams,
  } = options;
  const configFile = TSCONFIG_FILES[scope];

  if (files && files.length > 0) {
    const { configPath, cleanup } = await createFileSpecificTsconfig(scope, files, productDir, deps);
    try {
      return await runTypeScriptInvocation(
        productDir,
        resolveTscInvocation(productDir, deps, ["--project", configPath], toolPath),
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
    const { configPath, cleanup } = await createScopeFilteredTsconfig(scope, productDir, scopeConfig, deps);
    return runTypeScriptInvocation(
      productDir,
      resolveTscInvocation(productDir, deps, ["--project", configPath], toolPath),
      runner,
      outputStreams,
      cleanup,
    );
  }

  return runTypeScriptInvocation(
    productDir,
    resolveTscInvocation(productDir, deps, buildTypeScriptArgs({ scope, configFile }).slice(1), toolPath),
    runner,
    outputStreams,
  );
}

function resolveTscInvocation(
  productDir: string,
  deps: TypeScriptDeps,
  tscArgs: readonly string[],
  toolPath?: string,
): TypeScriptCommandInvocation {
  if (toolPath !== undefined) {
    return { tool: toolPath, args: tscArgs };
  }
  const tscBin = join(productDir, "node_modules", ".bin", "tsc");
  const tool = deps.existsSync(tscBin) ? tscBin : "npx";
  return {
    tool,
    args: tool === "npx" ? ["tsc", ...tscArgs] : tscArgs,
  };
}

function runTypeScriptInvocation(
  productDir: string,
  invocation: TypeScriptCommandInvocation,
  runner: ProcessRunner,
  outputStreams: ValidationSubprocessOutputStreams,
  cleanup: () => void = () => {},
): Promise<TypeScriptValidationResult> {
  return new Promise((resolve) => {
    const tscProcess = spawnManagedSubprocess(runner, invocation.tool, invocation.args, {
      cwd: productDir,
    });
    const chunks: string[] = [];
    const capture = (chunk: string | Uint8Array): void => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    };
    tscProcess.stdout?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    tscProcess.stderr?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    forwardValidationSubprocessOutput(tscProcess, outputStreams);

    tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      cleanup();
      const output = chunks.join("");
      if (code === 0) {
        resolve({ success: true, skipped: false, output });
      } else {
        resolve({ success: false, output, error: formatTypeScriptExitCodeError(code) });
      }
    });

    tscProcess.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      cleanup();
      resolve({ success: false, output: chunks.join(""), error: error.message });
    });
  });
}
