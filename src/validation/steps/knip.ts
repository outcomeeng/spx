/**
 * Knip validation step.
 *
 * Detects unused exports, dependencies, and files using knip.
 *
 * @module validation/steps/knip
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import {
  TEMPORARY_TSCONFIG_PARENT_SEGMENTS,
  TSCONFIG_FILES,
  TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS,
} from "@/validation/config/scope";
import type { ScopeConfig } from "../types";
import {
  defaultValidationSubprocessOutputStreams,
  forwardValidationSubprocessOutput,
  type ValidationSubprocessOutputStreams,
} from "./subprocess-output";

// =============================================================================
// DEFAULT DEPENDENCIES
// =============================================================================

/**
 * Default production process runner for Knip.
 */
export const defaultKnipProcessRunner: ProcessRunner = lifecycleProcessRunner;
export const KNIP_COMMAND_TOKENS = {
  COMMAND: "knip",
  NPX_COMMAND: "npx",
  TSCONFIG_FLAG: "--tsConfig",
  USE_TSCONFIG_FILES_FLAG: "--use-tsconfig-files",
} as const;
export const KNIP_LOCAL_BIN_SEGMENTS = ["node_modules", ".bin", KNIP_COMMAND_TOKENS.COMMAND] as const;

export interface KnipDeps {
  readonly existsSync: typeof existsSync;
  readonly mkdir: typeof mkdir;
  readonly mkdtemp: typeof mkdtemp;
  readonly rm: typeof rm;
  readonly writeFile: typeof writeFile;
}

const defaultKnipDeps: KnipDeps = {
  existsSync,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
};

export interface KnipValidationContext {
  readonly productDir: string;
  readonly typescriptScope: ScopeConfig;
  readonly toolPath?: string;
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
 * const result = await validateKnip({ productDir, typescriptScope: scopeConfig });
 * if (!result.success) {
 *   console.error("Knip found issues:", result.error);
 * }
 * ```
 */
export async function validateKnip(
  context: KnipValidationContext,
  runner: ProcessRunner = defaultKnipProcessRunner,
  deps: KnipDeps = defaultKnipDeps,
  outputStreams: ValidationSubprocessOutputStreams = defaultValidationSubprocessOutputStreams,
): Promise<{
  success: boolean;
  output?: string;
  error?: string;
}> {
  try {
    const { productDir, typescriptScope, toolPath } = context;
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeTargets = [
      ...typescriptScope.directories,
      ...typescriptScope.filePatterns,
    ];

    if (analyzeTargets.length === 0) {
      return { success: true };
    }

    return await runKnipSubprocess(productDir, typescriptScope, runner, deps, outputStreams, toolPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

async function runKnipSubprocess(
  productDir: string,
  typescriptScope: ScopeConfig,
  runner: ProcessRunner,
  deps: KnipDeps,
  outputStreams: ValidationSubprocessOutputStreams,
  toolPath?: string,
): Promise<{ success: boolean; output?: string; error?: string }> {
  const scopedTsconfig = typescriptScope.filteredByValidationPaths
    ? await createScopedKnipTsconfig(productDir, typescriptScope, deps)
    : undefined;
  const localBin = join(productDir, ...KNIP_LOCAL_BIN_SEGMENTS);
  const binary = toolPath ?? (deps.existsSync(localBin) ? localBin : KNIP_COMMAND_TOKENS.NPX_COMMAND);
  const baseArgs = scopedTsconfig === undefined
    ? []
    : [
      KNIP_COMMAND_TOKENS.USE_TSCONFIG_FILES_FLAG,
      KNIP_COMMAND_TOKENS.TSCONFIG_FLAG,
      scopedTsconfig.configPath,
    ];
  const args = binary === KNIP_COMMAND_TOKENS.NPX_COMMAND ? [KNIP_COMMAND_TOKENS.COMMAND, ...baseArgs] : baseArgs;
  const knipProcess = spawnManagedSubprocess(runner, binary, args, {
    cwd: productDir,
  });
  forwardValidationSubprocessOutput(knipProcess, outputStreams);
  const cleanup = scopedTsconfig?.cleanup ?? (async () => {});
  let cleanupStarted = false;
  let resultResolved = false;

  const cleanupOnce = async () => {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;
    await cleanup();
  };

  let knipOutput = "";
  let knipError = "";

  knipProcess.stdout?.on("data", (data: Buffer) => {
    knipOutput += data.toString();
  });

  knipProcess.stderr?.on("data", (data: Buffer) => {
    knipError += data.toString();
  });

  return new Promise((resolve) => {
    const resolveAfterCleanup = (result: { success: boolean; output?: string; error?: string }) => {
      if (resultResolved) {
        return;
      }
      resultResolved = true;
      void cleanupOnce().finally(() => resolve(result));
    };

    knipProcess.on("close", (code) => {
      if (code === 0) {
        resolveAfterCleanup({ success: true, output: knipOutput });
      } else {
        const errorOutput = knipOutput || knipError || "Unused code detected";
        resolveAfterCleanup({
          success: false,
          error: errorOutput,
        });
      }
    });

    knipProcess.on("error", (error) => {
      resolveAfterCleanup({ success: false, error: error.message });
    });
  });
}

async function createScopedKnipTsconfig(
  productDir: string,
  typescriptScope: ScopeConfig,
  deps: KnipDeps,
): Promise<{ configPath: string; cleanup: () => Promise<void> }> {
  const tempParentDir = join(productDir, ...TEMPORARY_TSCONFIG_PARENT_SEGMENTS);
  await deps.mkdir(tempParentDir, { recursive: true });
  const tempDir = await deps.mkdtemp(join(tempParentDir, "validate-knip-"));
  const configPath = join(tempDir, TSCONFIG_FILES.full);
  const toProjectPathPattern = (pattern: string) => isAbsolute(pattern) ? pattern : join(productDir, pattern);
  const project = [
    ...typescriptScope.directories.flatMap((directory) =>
      TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS.map((pattern) => `${directory}/${pattern}`)
    ),
    ...typescriptScope.filePatterns,
  ];
  const config = {
    extends: join(productDir, TSCONFIG_FILES.full),
    include: project.map(toProjectPathPattern),
    exclude: typescriptScope.excludePatterns.map(toProjectPathPattern),
  };
  await deps.writeFile(configPath, JSON.stringify(config, null, 2));
  return {
    configPath,
    cleanup: () => deps.rm(tempDir, { recursive: true, force: true }),
  };
}
