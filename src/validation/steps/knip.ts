/**
 * Knip validation step.
 *
 * Detects unused exports, dependencies, and files using knip.
 *
 * @module validation/steps/knip
 */

import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
export const KNIP_COMMAND_TOKENS = {
  COMMAND: "knip",
  CONFIG_FLAG: "--config",
} as const;

export interface KnipDeps {
  readonly existsSync: typeof existsSync;
  readonly mkdtemp: typeof mkdtemp;
  readonly rm: typeof rm;
  readonly writeFile: typeof writeFile;
}

const defaultKnipDeps: KnipDeps = {
  existsSync,
  mkdtemp,
  rm,
  writeFile,
};

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
  deps: KnipDeps = defaultKnipDeps,
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

    return await runKnipSubprocess(projectRoot, typescriptScope, runner, deps);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

async function runKnipSubprocess(
  projectRoot: string,
  typescriptScope: ScopeConfig,
  runner: ProcessRunner,
  deps: KnipDeps,
): Promise<{ success: boolean; error?: string }> {
  const scopedConfig = typescriptScope.filteredByValidationPaths
    ? await createScopedKnipConfig(typescriptScope, deps)
    : undefined;
  const localBin = join(projectRoot, "node_modules", ".bin", "knip");
  const binary = deps.existsSync(localBin) ? localBin : "npx";
  const baseArgs = scopedConfig === undefined ? [] : [KNIP_COMMAND_TOKENS.CONFIG_FLAG, scopedConfig.configPath];
  const args = binary === "npx" ? [KNIP_COMMAND_TOKENS.COMMAND, ...baseArgs] : baseArgs;
  const knipProcess = spawnManagedSubprocess(runner, binary, args, {
    cwd: projectRoot,
  });
  const cleanup = scopedConfig?.cleanup ?? (async () => {});

  let knipOutput = "";
  let knipError = "";

  knipProcess.stdout?.on("data", (data: Buffer) => {
    knipOutput += data.toString();
  });

  knipProcess.stderr?.on("data", (data: Buffer) => {
    knipError += data.toString();
  });

  return new Promise((resolve) => {
    knipProcess.on("close", (code) => {
      void cleanup().finally(() => {
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
    });

    knipProcess.on("error", (error) => {
      void cleanup().finally(() => {
        resolve({ success: false, error: error.message });
      });
    });
  });
}

async function createScopedKnipConfig(
  typescriptScope: ScopeConfig,
  deps: KnipDeps,
): Promise<{ configPath: string; cleanup: () => Promise<void> }> {
  const tempDir = await deps.mkdtemp(join(tmpdir(), "validate-knip-"));
  const configPath = join(tempDir, "knip.json");
  const project = typescriptScope.filePatterns.length > 0
    ? typescriptScope.filePatterns
    : typescriptScope.directories.map((directory) => `${directory}/**/*.{js,ts,tsx}`);
  const config = {
    project,
    ignore: typescriptScope.excludePatterns,
  };
  await deps.writeFile(configPath, JSON.stringify(config, null, 2));
  return {
    configPath,
    cleanup: () => deps.rm(tempDir, { recursive: true, force: true }),
  };
}
