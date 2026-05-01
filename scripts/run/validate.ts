#!/usr/bin/env tsx
/**
 * Build-time Validation Script
 *
 * Validates project structure and TypeScript compliance before build.
 *
 * TypeScript Validation Scopes:
 * - Default:  Entire codebase including tests, scripts and development tests in `/specs`
 * - Production-only: Files that are in production, including tests and scripts but excluding development tests in `/specs`
 *
 * Usage:
 *   pnpm run validate                # Include tests and scripts (default)
 *   pnpm run validate:production     # Production files only
 *
 * The unified tsconfig.json includes all files, but full validation is opt-in
 * to allow gradual fixing of TypeScript errors in tests without blocking deployments.
 */

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     ESLINT/TYPESCRIPT SCOPE ALIGNMENT                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * IMPORTANT: ESLint scope is now AUTOMATICALLY aligned with TypeScript scope.
 *
 * How it works:
 * 1. ESLint config reads TypeScript exclusions at runtime via `getTypeScriptExclusions()`
 * 2. In build mode: ESLint reads tsconfig.production.json exclusions and applies them
 * 3. In full mode: ESLint uses no additional exclusions (validates everything)
 * 4. Same TypeScript config file is used for import resolution in both modes
 *
 * Benefits:
 * ✅ Perfect alignment guaranteed by design (no manual sync needed)
 * ✅ Single source of truth (TypeScript configs)
 * ✅ Automatic sync when TypeScript exclusions change
 * ✅ No config duplication or drift possible
 *
 * Environment variable control:
 * - ESLINT_PRODUCTION_ONLY=1 → Production-only scope (excludes test files)
 * - ESLINT_PRODUCTION_ONLY unset → Full scope (includes test files)
 */

import chalk from "chalk";
import { Command } from "commander";
import * as JSONC from "jsonc-parser";
import madge from "madge";
import { type ChildProcess, spawn, type SpawnOptions } from "node:child_process";

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { extname, isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { getTypeScriptScope as libGetTypeScriptScope, TSCONFIG_FILES as LIB_TSCONFIG_FILES } from "@/validation/index";

// =============================================================================
// DEPENDENCY INJECTION INTERFACES
// =============================================================================

/**
 * @internal
 * Interface for subprocess execution - enables dependency injection for testing
 */
export interface ProcessRunner {
  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess;
}

// =============================================================================
// COLOR HELPERS (Vitest-style)
// =============================================================================

const colors = {
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
} as const;

// =============================================================================
// LOGGING SYSTEM WITH VERBOSITY CONTROL
// =============================================================================

export const LOG_VERBOSITY = {
  NORMAL: "normal" as const,
  QUIET: "quiet" as const,
} as const;
type LogVerbosity = (typeof LOG_VERBOSITY)[keyof typeof LOG_VERBOSITY];

let logVerbosity: LogVerbosity = LOG_VERBOSITY.NORMAL;

export const OUTPUT_MODES = {
  HUMAN: "human" as const,
  AGENT: "agent" as const,
} as const;
type OutputMode = (typeof OUTPUT_MODES)[keyof typeof OUTPUT_MODES];
let outputMode: OutputMode = OUTPUT_MODES.HUMAN;

/**
 * Centralized logging with verbosity and output mode control.
 *
 * - `outputMode`: HUMAN (verbose) vs AGENT (minimal - errors only)
 * - `logVerbosity`: NORMAL (full) vs QUIET (reduced)
 *
 * In AGENT mode, only errors are shown (agent needs to see what to fix).
 * In HUMAN mode, full progress and status information is shown.
 */
const log = {
  /** Always shown - errors and failures (agent needs to fix these) */
  error: (message?: string, ...optionalParams: unknown[]) => console.error(message, ...optionalParams),

  /** Always shown - warnings */
  warn: (message?: string, ...optionalParams: unknown[]) => console.error(message, ...optionalParams),

  /** Result/status messages - suppressed in AGENT mode (exit code is sufficient) */
  result: (message?: string, ...optionalParams: unknown[]) => {
    if (outputMode === OUTPUT_MODES.HUMAN) console.error(message, ...optionalParams);
  },

  /** Progress info - HUMAN mode + NORMAL verbosity only */
  info: (message?: string, ...optionalParams: unknown[]) => {
    if (outputMode === OUTPUT_MODES.HUMAN && logVerbosity === LOG_VERBOSITY.NORMAL) {
      console.info(message, ...optionalParams);
    }
  },

  /** Step progress - HUMAN mode + NORMAL verbosity only */
  step: (message?: string, ...optionalParams: unknown[]) => {
    if (outputMode === OUTPUT_MODES.HUMAN && logVerbosity === LOG_VERBOSITY.NORMAL) {
      console.log(message, ...optionalParams);
    }
  },

  /** Debug output - HUMAN mode + NORMAL verbosity only */
  debug: (message?: string, ...optionalParams: unknown[]) => {
    if (outputMode === OUTPUT_MODES.HUMAN && logVerbosity === LOG_VERBOSITY.NORMAL) {
      console.log(colors.dim(message, ...optionalParams));
    }
  },
};

function setLogVerbosity(level: LogVerbosity): void {
  logVerbosity = level;
}

function setOutputMode(mode: OutputMode): void {
  outputMode = mode;
}

// =============================================================================
// POSTEDIT HOOK SUPPORT
// =============================================================================

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    path?: string;
    notebook_path?: string;
  };
}

/**
 * @internal
 * Parse stdin JSON for Claude Code hook integration.
 * Returns file path from hook input or null if not available.
 */
export async function parseStdinJson(): Promise<string | null> {
  return new Promise((resolve) => {
    let data = "";
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (!data.trim()) {
        resolve(null);
        return;
      }
      try {
        const input: HookInput = JSON.parse(data);
        const filePath = input.tool_input?.file_path || input.tool_input?.path || input.tool_input?.notebook_path;
        resolve(filePath || null);
      } catch {
        resolve(null);
      }
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", finish);
    // Timeout after 100ms if no stdin
    setTimeout(finish, 100);
  });
}

/**
 * Check if file is a source file that should be validated.
 */
function isSourceFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

// Layout validation is now handled by dedicated script

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

export const EXECUTION_MODES = {
  READ: "read" as const,
  WRITE: "write" as const,
} as const;
type ExecutionMode = (typeof EXECUTION_MODES)[keyof typeof EXECUTION_MODES];

export const VALIDATION_SCOPES = {
  FULL: "full" as const,
  PRODUCTION: "production" as const,
} as const;
export type ValidationScope = (typeof VALIDATION_SCOPES)[keyof typeof VALIDATION_SCOPES];

const VALIDATION_TYPES = {
  TYPESCRIPT: { default: true },
  ESLINT: { default: true },
  KNIP: { default: false },
} as const;
type ValidationType = keyof typeof VALIDATION_TYPES;
export const VALIDATION_KEYS = Object.fromEntries(
  Object.entries(VALIDATION_TYPES).map(([key]) => [key, key]),
) as Record<ValidationType, ValidationType>;

// CLI-specific types
export const VALIDATION_VERBS = {
  ALL: "all",
  TYPECHECK: "typecheck",
  LINT: "lint",
  KNIP: "knip",
  POSTEDIT: "postedit",
} as const;
type ValidationVerb = (typeof VALIDATION_VERBS)[keyof typeof VALIDATION_VERBS];

interface CliOptions {
  scope?: ValidationScope;
  verbose?: boolean;
  debug?: boolean;
  postedit?: boolean;
}

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface ScopeConfig {
  directories: string[];
  filePatterns: string[];
  excludePatterns: string[];
}

interface TypeScriptConfig {
  include?: string[];
  exclude?: string[];
  extends?: string;
}

// =============================================================================
// NEW ARCHITECTURE: STEP-BASED VALIDATION SYSTEM
// =============================================================================

export interface ValidationContext {
  projectRoot: string;
  mode?: ExecutionMode;
  scope: ValidationScope;
  scopeConfig: ScopeConfig;
  enabledValidations: Partial<Record<ValidationType, boolean>>;
  validatedFiles?: string[];
  isFileSpecificMode: boolean;
}

export interface ValidationStepResult {
  success: boolean;
  error?: string;
  duration: number;
  skipped?: boolean;
}

interface ValidationStep {
  id: string;
  name: string;
  description: string;
  enabled: (context: ValidationContext) => boolean;
  execute: (context: ValidationContext) => Promise<ValidationStepResult>;
}

interface TimingData {
  stepId: string;
  durations: number[]; // Recent durations for moving average
  lastRun: number; // timestamp
}

interface ValidationTimings {
  [stepId: string]: TimingData;
}

// =============================================================================
// PURE ARGUMENT BUILDER FUNCTIONS
// =============================================================================

/**
 * @internal
 * Build ESLint CLI arguments based on validation context
 */
export function buildEslintArgs(context: {
  validatedFiles?: string[];
  mode?: ExecutionMode;
  cacheFile: string;
}): string[] {
  const { validatedFiles, mode, cacheFile } = context;
  const fixArg = mode === EXECUTION_MODES.WRITE ? ["--fix"] : [];
  const cacheArgs = ["--cache", "--cache-location", cacheFile];

  if (validatedFiles && validatedFiles.length > 0) {
    return [
      "eslint",
      "--config",
      "eslint.config.ts",
      ...cacheArgs,
      ...fixArg,
      "--",
      ...validatedFiles,
    ];
  }
  return ["eslint", ".", "--config", "eslint.config.ts", ...cacheArgs, ...fixArg];
}

/**
 * @internal
 * Build TypeScript CLI arguments based on validation scope
 */
export function buildTypeScriptArgs(context: {
  scope: ValidationScope;
  configFile: string;
}): string[] {
  const { scope, configFile } = context;
  return scope === VALIDATION_SCOPES.FULL ? ["tsc", "--noEmit"] : ["tsc", "--project", configFile];
}

// =============================================================================
// TIMING CACHE SYSTEM
// =============================================================================

const CACHE_DIR = "dist";
const VALIDATION_TIMINGS_FILE = path.join(CACHE_DIR, ".validation-timings.json");
const ESLINT_CACHE_FILE = path.join(CACHE_DIR, ".eslintcache");
const MAX_TIMING_HISTORY = 10; // Keep last 10 runs for moving average

// Timing cache state
let validationTimings: ValidationTimings = {};

function loadValidationTimings(): void {
  try {
    if (existsSync(VALIDATION_TIMINGS_FILE)) {
      const data = readFileSync(VALIDATION_TIMINGS_FILE, "utf-8");
      validationTimings = JSON.parse(data);
    }
  } catch (error) {
    log.info("⚠️ Failed to load validation timings, starting fresh:", error);
    validationTimings = {};
  }
}

function saveValidationTimings(): void {
  try {
    // Ensure cache directory exists
    const dir = CACHE_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(VALIDATION_TIMINGS_FILE, JSON.stringify(validationTimings, null, 2));
  } catch (error) {
    log.warn("⚠️ Failed to save validation timings:", error);
  }
}

function getEstimatedDuration(stepId: string): number {
  const timingData = validationTimings[stepId];
  if (!timingData || timingData.durations.length === 0) {
    return 0; // No historical data
  }

  // Calculate moving average of recent runs
  const recentDurations = timingData.durations.slice(-5); // Last 5 runs
  const average = recentDurations.reduce((sum, duration) => sum + duration, 0) / recentDurations.length;
  return Math.round(average);
}

function recordValidationDuration(stepId: string, duration: number): void {
  if (!validationTimings[stepId]) {
    validationTimings[stepId] = {
      stepId,
      durations: [],
      lastRun: Date.now(),
    };
  }

  const timingData = validationTimings[stepId];
  timingData.durations.push(duration);
  timingData.lastRun = Date.now();

  // Keep only recent history to prevent file from growing too large
  if (timingData.durations.length > MAX_TIMING_HISTORY) {
    timingData.durations = timingData.durations.slice(-MAX_TIMING_HISTORY);
  }

  saveValidationTimings();
}

function getTotalEstimatedDuration(stepIds: string[]): number {
  return stepIds.reduce((total, stepId) => total + getEstimatedDuration(stepId), 0);
}

// =============================================================================
// PROGRESS REPORTER
// =============================================================================

// Progress reporter state
let progressSteps: ValidationStep[] = [];
let currentStepIndex = 0;
let validationStartTime = 0;
let stepStartTime = 0;

function startValidationProgress(steps: ValidationStep[]): void {
  progressSteps = steps;
  currentStepIndex = 0;
  validationStartTime = performance.now();

  const totalEstimated = getTotalEstimatedDuration(steps.map((step) => step.id));

  log.info(colors.bold(colors.info("🚀 Starting build-time validation...")) + "\n");

  if (totalEstimated > 0) {
    const estimatedSeconds = Math.ceil(totalEstimated / 1000);
    log.info(
      colors.dim(`📊 ${steps.length} steps planned, estimated duration: ~${estimatedSeconds}s`),
    );
  } else {
    log.info(colors.dim(`📊 ${steps.length} steps planned (no timing history)`));
  }
}

function startValidationStep(step: ValidationStep): void {
  stepStartTime = performance.now();

  const stepNumber = currentStepIndex + 1;
  const totalSteps = progressSteps.length;

  const estimatedDuration = getEstimatedDuration(step.id);
  const estimatedText = estimatedDuration > 0 ? colors.dim(` (~${Math.ceil(estimatedDuration / 1000)}s)`) : "";

  log.info(`🔄 Step ${stepNumber} of ${totalSteps}: ${step.description}${estimatedText}`);
}

function completeValidationStep(step: ValidationStep, result: ValidationStepResult): void {
  const duration = performance.now() - stepStartTime;
  const stepNumber = currentStepIndex + 1;

  // Record timing for future estimates
  recordValidationDuration(step.id, duration);

  currentStepIndex++;

  if (result.success) {
    const durationText = colors.dim(`(${(duration / 1000).toFixed(1)}s)`);
    log.step(colors.success(`✅ Step ${stepNumber} completed: ${step.name} ${durationText}`));
  } else {
    // Don't log individual step failures - they're shown in the timing summary
    log.step(colors.error(`❌ Step ${stepNumber} failed: ${step.name}`));
  }
}

function completeValidationProgress(allResults: ValidationStepResult[]): boolean {
  const failedCount = allResults.filter((r) => !r.success).length;
  const hasFailures = failedCount > 0;

  const totalTime = performance.now() - validationStartTime;
  const successCount = allResults.filter((r) => r.success).length;
  const skippedCount = allResults.filter((r) => r.skipped).length;

  // Create timing summary (sorted by duration)
  const stepTimings = allResults
    .map((result, index) => ({
      step: progressSteps[index].name,
      duration: result.duration,
      success: result.success,
      skipped: result.skipped,
    }))
    .filter((timing) => !timing.skipped)
    .sort((a, b) => b.duration - a.duration);

  log.info("\n" + "⏱️  Duration Per Step" + colors.dim("  (longest to shortest)"));
  log.info(colors.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

  stepTimings.forEach((timing, index) => {
    const durationMs = timing.duration.toFixed(1);
    const percentage = ((timing.duration / totalTime) * 100).toFixed(1);
    const icon = index === 0 ? colors.warning("🐌") : colors.success("⚡");
    const stepName = colors.dim(timing.step.padEnd(30));
    const duration = colors.bold(`${durationMs.padStart(6)}ms`);
    const percent = colors.dim(`(${percentage.padStart(4)}%)`);
    const status = timing.success ? "" : colors.error(" ❌");

    log.info(`${icon} ${stepName} ${duration} ${percent}${status}`);
  });

  log.info(colors.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  log.info(colors.dim("🏁 Total validation time: ") + colors.bold(`${totalTime.toFixed(1)}ms`));

  if (skippedCount > 0) {
    log.info(colors.dim(`⏩ ${skippedCount} steps skipped`));
  }

  // Report final status
  if (hasFailures) {
    log.error("\n" + colors.bold(colors.error("❌ Build-time validation FAILED")));
    // Don't throw here - let the caller handle exit codes
    return false;
  } else {
    log.info(
      "\n"
        + colors.bold(colors.success(`✅ Build-time validation PASSED`))
        + colors.dim(` (${successCount} steps completed)`),
    );
    return true;
  }
}

// =============================================================================
// VALIDATION RUNNER
// =============================================================================

async function runValidationSteps(
  steps: ValidationStep[],
  context: ValidationContext,
): Promise<void> {
  // Load timing cache at start
  loadValidationTimings();

  // Filter steps based on what's enabled for this context
  const enabledSteps = steps.filter((step) => step.enabled(context));

  if (enabledSteps.length === 0) {
    console.info("⚠️ No validation steps enabled, skipping validation");
    return;
  }

  // Start progress reporting (quiet mode for postedit hook)
  startValidationProgress(enabledSteps);

  const results: ValidationStepResult[] = [];

  // Execute each step
  for (const step of enabledSteps) {
    startValidationStep(step);

    try {
      const result = await step.execute(context);
      results.push(result);
      completeValidationStep(step, result);

      // Stop on first failure (fail-fast)
      if (!result.success) {
        break;
      }
    } catch (error) {
      const failedResult: ValidationStepResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0, // Duration will be calculated by completeValidationStep
      };
      results.push(failedResult);
      completeValidationStep(step, failedResult);
      break;
    }
  }

  // Complete progress reporting
  const success = completeValidationProgress(results);

  if (!success) {
    throw new Error("Build-time validation failed");
  }
}

// =============================================================================
// VALIDATION STEP DEFINITIONS
// =============================================================================

const circularDependencyStep: ValidationStep = {
  id: "circular-deps",
  name: "Circular Dependencies",
  description: "Checking for circular dependencies",
  enabled: (context) => !context.isFileSpecificMode && context.enabledValidations.TYPESCRIPT === true,
  execute: async (context) => {
    const startTime = performance.now();
    try {
      const result = await validateCircularDependencies(context.scope, context.scopeConfig);
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

const knipStep: ValidationStep = {
  id: "knip",
  name: "Unused Code",
  description: "Detecting unused exports, dependencies, and files",
  enabled: (context) =>
    context.enabledValidations.KNIP === true
    && validationEnabled(VALIDATION_KEYS.KNIP)
    && !context.isFileSpecificMode,
  execute: async (context) => {
    const startTime = performance.now();
    try {
      const result = await validateKnip(context.scope, context.scopeConfig);
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

const eslintStep: ValidationStep = {
  id: "eslint",
  name: "ESLint",
  description: "Validating ESLint compliance",
  enabled: (context) => context.enabledValidations.ESLINT === true && validationEnabled(VALIDATION_KEYS.ESLINT),
  execute: async (context: ValidationContext) => {
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

const typescriptStep: ValidationStep = {
  id: "typescript",
  name: "TypeScript",
  description: "Validating TypeScript",
  enabled: (context) => context.enabledValidations.TYPESCRIPT === true && validationEnabled(VALIDATION_KEYS.TYPESCRIPT),
  execute: async (context) => {
    const startTime = performance.now();
    try {
      const result = await validateTypeScript(
        context.scope,
        context.scopeConfig,
        context.validatedFiles,
      );
      return {
        success: result.success,
        error: result.error,
        duration: performance.now() - startTime,
        skipped: result.skipped,
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

// Step registry - defines the order of execution
const VALIDATION_STEPS: ValidationStep[] = [
  circularDependencyStep,
  knipStep,
  eslintStep,
  typescriptStep,
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a file has a TypeScript extension
 */
function isTypeScriptFile(filePath: string): boolean {
  const ext = extname(filePath);
  return [".ts", ".tsx", ".mts", ".cts"].includes(ext);
}

/**
 * Recursively find TypeScript files in a directory
 */
function findTypeScriptFilesInDirectory(dirPath: string): string[] {
  const tsFiles: string[] = [];

  try {
    const items = readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dirPath, item.name);

      if (item.isFile() && isTypeScriptFile(item.name)) {
        tsFiles.push(fullPath);
      } else if (item.isDirectory() && !item.name.startsWith(".") && item.name !== "node_modules") {
        // Recursively search subdirectories (excluding hidden dirs and node_modules)
        tsFiles.push(...findTypeScriptFilesInDirectory(fullPath));
      }
    }
  } catch (error) {
    log.warn(`⚠️ Unable to read directory ${dirPath}:`, error);
  }

  return tsFiles;
}

/**
 * @internal
 * Validate and expand file/directory arguments into TypeScript files
 */
export function validateAndExpandFilePaths(paths: string[]): string[] {
  if (paths.length === 0) {
    return [];
  }

  const validFiles: string[] = [];
  const invalidPaths: string[] = [];

  for (const path of paths) {
    // Use the original path for existence check (don't resolve yet)
    if (!existsSync(path)) {
      invalidPaths.push(path);
      continue;
    }

    const stats = statSync(path);
    const isDirectory = stats.isDirectory();

    if (isDirectory) {
      // It's a directory - find all TypeScript files
      const tsFiles = findTypeScriptFilesInDirectory(path);
      validFiles.push(...tsFiles);
      log.info(`📁 Found ${tsFiles.length} TypeScript files in directory: ${path}`);
    } else if (isTypeScriptFile(path)) {
      // It's a TypeScript file - resolve to absolute path for consistency
      validFiles.push(resolve(path));
    } else {
      // It's a file but not TypeScript
      log.warn(`⚠️ Skipping non-TypeScript file: ${path}`);
    }
  }

  if (invalidPaths.length > 0) {
    console.error(`❌ Path(s) not found: ${invalidPaths.join(", ")}`);
    throw new Error(`Path(s) not found: ${invalidPaths.join(", ")}`);
  }

  if (validFiles.length === 0 && paths.length > 0) {
    log.warn(`⚠️ No TypeScript files found in specified paths`);
  }

  return validFiles;
}

function validationEnabled(envVarKey: ValidationType): boolean {
  const envVar = `${envVarKey}_VALIDATION_ENABLED`;
  const explicitlyDisabled = process.env[envVar] === "0";
  const explicitlyEnabled = process.env[envVar] === "1";

  if (VALIDATION_TYPES[envVarKey as ValidationType].default) {
    return !explicitlyDisabled;
  }
  return explicitlyEnabled;
}

// =============================================================================
// TYPESCRIPT-FIRST SCOPE RESOLUTION
// =============================================================================

/**
 * Parse TypeScript configuration using proper JSONC parser
 */
function parseTypeScriptConfig(configPath: string): TypeScriptConfig {
  try {
    const configContent = readFileSync(configPath, "utf-8");
    const parsed = JSONC.parse(configContent) as TypeScriptConfig;
    return parsed;
  } catch (error) {
    // Fallback: return minimal config and let directory detection work
    log.warn(`⚠️  Could not parse ${configPath}, using directory detection fallback: ${error}`);
    return {
      include: ["**/*.ts", "**/*.tsx"],
      exclude: ["node_modules/**", ".pnpm-store/**", "dist/**"],
    };
  }
}

/**
 * Resolve complete TypeScript configuration including extends
 */
function resolveTypeScriptConfig(mode: ValidationScope): TypeScriptConfig {
  const configFile = LIB_TSCONFIG_FILES[mode];
  const config = parseTypeScriptConfig(configFile);

  if (config.extends) {
    const baseConfig = parseTypeScriptConfig(config.extends);
    return {
      include: config.include || baseConfig.include || [],
      exclude: [...(baseConfig.exclude || []), ...(config.exclude || [])],
    };
  }

  return {
    include: config.include || [],
    exclude: config.exclude || [],
  };
}

/**
 * Check if a directory contains TypeScript files (recursively, but shallow to avoid performance issues)
 */
function hasTypeScriptFilesRecursive(dirPath: string, maxDepth: number = 2): boolean {
  if (maxDepth <= 0) return false;

  try {
    const items = readdirSync(dirPath, { withFileTypes: true });

    // Check for TypeScript files in current directory
    const hasDirectTsFiles = items.some(
      (item) => item.isFile() && (item.name.endsWith(".ts") || item.name.endsWith(".tsx")),
    );

    if (hasDirectTsFiles) return true;

    // Check subdirectories (limited depth to avoid performance issues)
    const subdirs = items.filter((item) => item.isDirectory() && !item.name.startsWith("."));
    for (const subdir of subdirs.slice(0, 5)) {
      // Limit to first 5 subdirs
      if (hasTypeScriptFilesRecursive(join(dirPath, subdir.name), maxDepth - 1)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get top-level directories containing TypeScript files based on tsconfig and exclude patterns
 */
function getTopLevelDirectoriesWithTypeScript(config: TypeScriptConfig): string[] {
  const allTopLevelItems = readdirSync(".", { withFileTypes: true });
  const directories = new Set<string>();

  // Find all top-level directories
  const topLevelDirs = allTopLevelItems
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => !name.startsWith("."));

  // Check if each directory should be included based on tsconfig include/exclude patterns
  for (const dir of topLevelDirs) {
    // Check if directory is explicitly excluded
    const isExcluded = config.exclude?.some((pattern) => {
      // Handle patterns like "specs/**/*", "docs/**/*"
      if (pattern.includes("/**")) {
        const dirPattern = pattern.split("/**")[0];
        return dirPattern === dir;
      }
      // Handle exact matches and directory patterns
      return pattern === dir || pattern.startsWith(dir + "/") || pattern === dir + "/**";
    });

    if (!isExcluded) {
      // Check if directory has TypeScript files (recursive check for non-empty directories)
      try {
        const hasTypeScriptFiles = hasTypeScriptFilesRecursive(dir);
        if (hasTypeScriptFiles) {
          directories.add(dir);
        }
      } catch {
        // Directory access error, skip
        continue;
      }
    }
  }

  // Also add explicitly mentioned directories from include patterns
  if (config.include) {
    for (const pattern of config.include) {
      // Extract directory from patterns like "scripts/**/*.ts", "tests/**/*.tsx"
      if (pattern.includes("/")) {
        const topLevelDir = pattern.split("/")[0];
        if (topLevelDir && !topLevelDir.includes("*") && !topLevelDir.startsWith(".")) {
          directories.add(topLevelDir);
        }
      }
    }
  }

  return Array.from(directories).sort();
}

/**
 * Get validation directories based on tsconfig files (eliminates hardcoded strings)
 */
function getValidationDirectories(mode: ValidationScope): string[] {
  // Get TypeScript configuration for the specified mode
  const config = resolveTypeScriptConfig(mode);

  // Get directories that contain TypeScript files and respect tsconfig exclude patterns
  const configDirectories = getTopLevelDirectoriesWithTypeScript(config);

  log.debug(`📁 Directories from ${LIB_TSCONFIG_FILES[mode]}: ${configDirectories.join(", ")}`);
  log.debug(`🚫 Excluded patterns: ${config.exclude?.join(", ") || "none"}`);

  // Only include directories that actually exist
  const existingDirectories = configDirectories.filter((dir) => existsSync(dir));

  log.debug(`✅ Existing directories: ${existingDirectories.join(", ")}`);

  return existingDirectories;
}

/**
 * Get authoritative validation scope (separate from production configuration)
 */
export function getTypeScriptScope(mode: ValidationScope): ScopeConfig {
  log.info(`🔍 Resolving validation scope for ${mode} mode...`);

  // Use validation-focused directory selection, not production configuration
  const directories = getValidationDirectories(mode);

  // Still read TypeScript config for reference, but don't use it for directory filtering
  const config = resolveTypeScriptConfig(mode);

  log.debug(`📁 Validation scope directories: ${directories.join(", ")}`);

  return {
    directories,
    filePatterns: config.include || [],
    excludePatterns: config.exclude || [],
  };
}

// =============================================================================
// ESLINT VALIDATION WITH AUTOMATIC TYPESCRIPT SCOPE ALIGNMENT
// =============================================================================

/**
 * Validate ESLint compliance using automatic TypeScript scope alignment
 * @param runner - Injectable process runner for testing (defaults to real spawn)
 */
export async function validateESLint(
  context: ValidationContext,
  runner: ProcessRunner = { spawn },
): Promise<{
  success: boolean;
  error?: string;
}> {
  const { scope, scopeConfig, validatedFiles, mode } = context;
  return new Promise((resolve) => {
    let eslintArgs: string[];
    let logMessage: string;

    // Set environment variable to control ESLint scope and initialize logMessage
    if (!validatedFiles || validatedFiles.length === 0) {
      if (scope === VALIDATION_SCOPES.PRODUCTION) {
        // Production-only scope: match TypeScript scope
        logMessage = "🔄 Running ESLint validation (production scope - matching TypeScript scope)...";
        process.env.ESLINT_PRODUCTION_ONLY = "1"; // Signal production mode
      } else {
        // Full scope: match TypeScript full validation
        logMessage = "🔄 Running ESLint validation (full scope - matching TypeScript validation)...";
        delete process.env.ESLINT_PRODUCTION_ONLY; // Ensure it's not set
      }
    } else {
      // Initialize logMessage for file-specific mode (will be overridden below)
      logMessage = "";
    }

    // Build ESLint arguments based on whether specific files are provided
    const fixArg = mode !== undefined && mode === EXECUTION_MODES.WRITE ? ["--fix"] : [];
    // Use cache for faster subsequent runs
    const cacheArgs = ["--cache", "--cache-location", ESLINT_CACHE_FILE];
    if (validatedFiles && validatedFiles.length > 0) {
      // File-specific validation with -- separator to handle files starting with dashes
      eslintArgs = [
        "eslint",
        "--config",
        "eslint.config.ts",
        ...cacheArgs,
        ...fixArg,
        "--",
        ...validatedFiles,
      ];
      logMessage = `🔄 Running ESLint validation on ${validatedFiles.length} file(s)...`;
      log.step(logMessage);
      log.debug(`🎯 Validating files: ${validatedFiles.join(", ")}`);
    } else {
      // Full validation using directory scope
      eslintArgs = ["eslint", ".", "--config", "eslint.config.ts", ...cacheArgs, ...fixArg];
      log.step(logMessage);
      log.debug(`🎯 Using TypeScript-derived scope: ${scopeConfig.directories.join(", ")}`);
    }

    const eslintProcess = runner.spawn("npx", eslintArgs, {
      cwd: process.cwd(),
      stdio: "inherit", // Preserve colored output and interactivity
    });

    eslintProcess.on("close", (code) => {
      if (code === 0) {
        const scopeDescription = validatedFiles?.length
          ? `${validatedFiles.length} file(s)`
          : "full scope";
        log.step(colors.success(`✅ ESLint validation passed (${scopeDescription})`));
        resolve({ success: true });
      } else {
        const scopeDescription = validatedFiles?.length
          ? `${validatedFiles.length} file(s)`
          : "full scope";
        log.error(colors.error(`❌ ESLint validation failed (${scopeDescription})`));
        resolve({ success: false, error: `ESLint exited with code ${code}` });
      }
    });

    eslintProcess.on("error", (error) => {
      log.error(`❌ ESLint validation failed: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
  });
}

/**
 * Validate circular dependencies using TypeScript-derived scope
 */
export async function validateCircularDependencies(
  mode: ValidationScope,
  typescriptScope: ScopeConfig,
  _runner: ProcessRunner = { spawn },
): Promise<{
  success: boolean;
  error?: string;
  circularDependencies?: string[][];
}> {
  try {
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories;

    log.info(`🔄 Analyzing circular dependencies (${mode} scope - validation aligned)...`);
    log.info(`🎯 Analyzing directories: ${analyzeDirectories.join(", ")}`);

    if (analyzeDirectories.length === 0) {
      log.warn("⚠️  No directories found to analyze");
      return { success: true };
    }

    // Use the appropriate TypeScript config based on scope
    const tsConfigFile = LIB_TSCONFIG_FILES[mode];

    // Convert tsconfig exclude patterns to madge excludeRegExp
    // Glob patterns like "tests/fixtures/**/*" → regex that matches paths containing "tests/fixtures/"
    const excludeRegExps = typescriptScope.excludePatterns.map((pattern) => {
      // Remove trailing /**/* or /* for cleaner matching
      const cleanPattern = pattern.replace(/\/\*\*?\/\*$/, "");
      // Escape regex special chars and create regex
      const escaped = cleanPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped);
    });

    const result = await madge(analyzeDirectories, {
      fileExtensions: ["ts", "tsx"],
      tsConfig: tsConfigFile,
      excludeRegExp: excludeRegExps,
    });

    const circular = result.circular();

    if (circular.length === 0) {
      log.info(colors.success("✅ No circular dependencies found (validation scope aligned)"));
      return { success: true };
    } else {
      console.error(colors.error(`❌ Found ${circular.length} circular dependency cycle(s):`));
      circular.forEach((cycle, index) => {
        console.error(colors.dim(`\n  Cycle ${index + 1}: `) + colors.warning(cycle.join(" → ")));
      });

      return {
        success: false,
        error: `Found ${circular.length} circular dependency cycle(s)`,
        circularDependencies: circular,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Circular dependency analysis failed:", {}, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Validate unused code using knip with TypeScript-derived scope
 */
async function validateKnip(
  mode: ValidationScope,
  typescriptScope: ScopeConfig,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Use TypeScript-derived directories for perfect scope alignment
    const analyzeDirectories = typescriptScope.directories;

    log.info(`🔄 Analyzing unused code with knip (${mode} scope - validation aligned)...`);
    log.info(`🎯 Analyzing directories: ${analyzeDirectories.join(", ")}`);

    if (analyzeDirectories.length === 0) {
      log.warn("⚠️  No directories found to analyze");
      return { success: true };
    }

    return new Promise((resolve) => {
      const knipProcess = spawn("npx", ["knip"], {
        cwd: process.cwd(),
        stdio: "pipe",
      });

      let knipOutput = "";
      let knipError = "";

      knipProcess.stdout?.on("data", (data) => {
        knipOutput += data.toString();
      });

      knipProcess.stderr?.on("data", (data) => {
        knipError += data.toString();
      });

      knipProcess.on("close", (code) => {
        if (code === 0) {
          log.info(colors.success("✅ No unused code found (validation scope aligned)"));
          resolve({ success: true });
        } else {
          console.error(colors.error("❌ Unused code detected:"));
          if (knipOutput) {
            console.error(knipOutput);
          }
          if (knipError) {
            console.error(knipError);
          }
          resolve({
            success: false,
            error: "Unused code detected - see output above",
          });
        }
      });

      knipProcess.on("error", (error) => {
        console.error("❌ Knip analysis failed:", {}, error);
        resolve({ success: false, error: error.message });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Knip analysis failed:", {}, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Create a temporary TypeScript configuration file for file-specific validation
 */
async function createFileSpecificTsconfig(
  mode: ValidationScope,
  files: string[],
): Promise<{ configPath: string; tempDir: string; cleanup: () => void }> {
  // Create temporary directory
  const tempDir = await mkdtemp(join(tmpdir(), "validate-ts-"));
  const configPath = join(tempDir, "tsconfig.json");

  // Get base config file
  const baseConfigFile = LIB_TSCONFIG_FILES[mode];

  // Ensure all file paths are absolute
  const projectRoot = process.cwd();
  const absoluteFiles = files.map((file) => {
    // If the file is already absolute, use it as-is
    // If it's relative, resolve it relative to the project root
    return isAbsolute(file) ? file : join(projectRoot, file);
  });

  // Create temporary tsconfig that extends the base config and restricts to specific files
  // Note: We use types: ["node"] to avoid issues with vitest/globals not being resolvable
  // from a temp directory. Test files may need vitest globals but regular source files don't.
  const tempConfig = {
    extends: join(projectRoot, baseConfigFile),
    files: absoluteFiles,
    include: [], // Explicitly override include to prevent inheriting patterns
    exclude: [], // Explicitly override exclude since we're using files
    compilerOptions: {
      noEmit: true,
      // Ensure TypeScript can find type definitions from project root
      typeRoots: [join(projectRoot, "node_modules", "@types")],
      types: ["node"], // Override base config's types to avoid vitest resolution issues
    },
  };

  // Write temporary config
  writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));

  // Return config path and cleanup function
  const cleanup = () => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Log cleanup error but don't fail validation
      log.warn(`⚠️  Failed to cleanup temporary directory ${tempDir}: ${error}`);
    }
  };

  return { configPath, tempDir, cleanup };
}

/**
 * Validate TypeScript using authoritative configuration
 */
export async function validateTypeScript(
  mode: ValidationScope,
  typescriptScope: ScopeConfig,
  files?: string[],
  runner: ProcessRunner = { spawn },
): Promise<{
  success: boolean;
  error?: string;
  skipped?: boolean;
}> {
  const configFile = LIB_TSCONFIG_FILES[mode];

  // Determine tool and arguments based on whether specific files are provided
  let tool: string;
  let tscArgs: string[];
  let logMessage: string;

  if (files && files.length > 0) {
    // File-specific validation using custom temporary tsconfig
    logMessage = `🔄 TypeScript validation: ${files.length} file(s) using ${configFile}`;
    log.step(logMessage);
    log.debug(`🎯 Validating files: ${files.join(", ")}`);

    // Create temporary tsconfig for file-specific validation
    const { configPath, cleanup } = await createFileSpecificTsconfig(mode, files);

    try {
      return new Promise((resolve) => {
        const tscProcess = runner.spawn("npx", ["tsc", "--project", configPath], {
          cwd: process.cwd(),
          stdio: "inherit", // Preserve colored TypeScript output
        });

        tscProcess.on("close", (code) => {
          cleanup(); // Always cleanup temp directory
          if (code === 0) {
            log.step(colors.success(`✅ TypeScript validation passed (${files.length} file(s))`));
            resolve({ success: true, skipped: false });
          } else {
            log.error(colors.error(`❌ TypeScript validation failed (${files.length} file(s))`));
            resolve({ success: false, error: `TypeScript exited with code ${code}` });
          }
        });

        tscProcess.on("error", (error) => {
          cleanup(); // Always cleanup temp directory
          log.error(`❌ TypeScript validation failed: ${error.message}`);
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      cleanup(); // Cleanup on config creation failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create temporary config: ${errorMessage}` };
    }
  } else {
    // Full validation using tsc
    tool = "npx";
    tscArgs = mode === VALIDATION_SCOPES.FULL ? ["tsc", "--noEmit"] : ["tsc", "--project", configFile];
    logMessage = `🔄 TypeScript validation: ${mode} scope using ${configFile}`;
    log.step(logMessage);
    log.debug(`🎯 Validating directories: ${typescriptScope.directories.join(", ")}`);
  }

  return new Promise((resolve) => {
    const tscProcess = runner.spawn(tool, tscArgs, {
      cwd: process.cwd(),
      stdio: "inherit", // Preserve colored TypeScript output
    });

    tscProcess.on("close", (code) => {
      if (code === 0) {
        const scopeDescription = files?.length ? `${files.length} file(s)` : `${mode} scope`;
        log.step(colors.success(`✅ TypeScript validation passed (${scopeDescription})`));
        resolve({ success: true, skipped: false });
      } else {
        const scopeDescription = files?.length ? `${files.length} file(s)` : `${mode} scope`;
        log.error(colors.error(`❌ TypeScript validation failed (${scopeDescription})`));
        resolve({ success: false, error: `TypeScript exited with code ${code}` });
      }
    });

    tscProcess.on("error", (error) => {
      log.error(`❌ TypeScript validation failed: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
  });
}

/**
 * Set up CLI configuration and logging based on options
 */
function setupEnvironment(options: CliOptions): void {
  // Set logging levels based on CLI options
  if (options.verbose) {
    process.env.LOG_INFO = "scripting";
    log.info("🔍 Verbose logging enabled");
  }

  if (options.debug) {
    process.env.LOG_DEBUG = "scripting";
    log.info("🐛 Debug logging enabled");
  }
}

/**
 * Get validation scope from CLI options with environment variable fallback
 */
function getValidationScope(options: CliOptions): ValidationScope {
  // CLI option takes precedence over environment variable
  if (options.scope) {
    return options.scope;
  }

  // Default to full scope
  return VALIDATION_SCOPES.FULL;
}

/**
 * Determine which validations to run based on verb
 */
function getEnabledValidations(
  verb: ValidationVerb | ValidationVerb[],
): Partial<Record<ValidationType, boolean>> {
  if (Array.isArray(verb)) {
    return {
      TYPESCRIPT: verb.includes(VALIDATION_VERBS.TYPECHECK),
      ESLINT: verb.includes(VALIDATION_VERBS.LINT),
      KNIP: verb.includes(VALIDATION_VERBS.KNIP),
    };
  } else {
    switch (verb) {
      case VALIDATION_VERBS.TYPECHECK:
        return { TYPESCRIPT: true };
      case VALIDATION_VERBS.LINT:
        return { ESLINT: true };
      case VALIDATION_VERBS.KNIP:
        return { KNIP: true };
      case VALIDATION_VERBS.POSTEDIT:
        // ESLint only - typescript-eslint already catches type errors
        // Skipping tsc cuts hook time in half (~2.2s → ~1.1s)
        return { ESLINT: true };
      case VALIDATION_VERBS.ALL:
      default:
        return { TYPESCRIPT: true, ESLINT: true, KNIP: true };
    }
  }
}

/**
 * Main validation orchestrator - clean architecture with step-based system
 */
async function validate(
  verb: ValidationVerb | ValidationVerb[],
  options: CliOptions,
  filePaths?: string[],
): Promise<void> {
  // Setup environment
  setupEnvironment(options);

  // Prepare validation context
  const projectRoot = process.cwd();
  const validatedFiles = (filePaths && filePaths?.length > 0 && validateAndExpandFilePaths(filePaths)) || [];
  const isFileSpecificMode = validatedFiles && validatedFiles?.length > 0;
  const mode = getValidationScope(options);
  const enabledValidations = getEnabledValidations(verb);

  // Resolve TypeScript scope from the validation library.
  let typescriptScope: ScopeConfig;
  try {
    typescriptScope = libGetTypeScriptScope(mode);
  } catch (error) {
    console.error("❌ Failed to resolve TypeScript configuration:", {}, error);
    throw error;
  }

  // Create validation context
  const context: ValidationContext = {
    mode: options?.postedit === true ? EXECUTION_MODES.WRITE : EXECUTION_MODES.READ,
    scope: mode,
    scopeConfig: typescriptScope,
    validatedFiles,
    isFileSpecificMode,
    enabledValidations,
    projectRoot,
  };

  // Log validation scope information
  if (isFileSpecificMode) {
    const fileCount = validatedFiles.length;
    log.info(
      colors.bold(colors.info(`🎯 File-specific validation:`))
        + " "
        + colors.dim(`${fileCount} file${fileCount > 1 ? "s" : ""}`),
    );
    log.debug(`📄 Files: ${validatedFiles.join(", ")}`);
  } else {
    log.info(
      colors.bold(
        colors.dim(`🔍 Validation verb: `)
          + colors.info(verb as string)
          + colors.dim(` Scope: `)
          + colors.info(mode),
      ),
    );
  }

  // Configuration insights reporting
  if (!isFileSpecificMode) {
    log.debug(`🎯 Validation scope: ${typescriptScope.directories.join(", ")}`);
    log.debug(`📄 Config files: ${LIB_TSCONFIG_FILES[mode]} + eslint.config.ts`);
  }

  // Create and run validation with clean step-based architecture
  await runValidationSteps(VALIDATION_STEPS, context);
}

/**
 * Run postedit validation for Claude Code hook.
 * Reads file path from stdin JSON, runs fast checks, uses exit code 2 for failures.
 */
async function runPosteditValidation(): Promise<void> {
  // Set agent mode for hook output
  setOutputMode(OUTPUT_MODES.AGENT);

  // Set quiet mode for hook output
  setLogVerbosity(LOG_VERBOSITY.QUIET);

  // Read file path from stdin JSON
  const filePath = await parseStdinJson();

  if (!filePath) {
    // No file provided - silently exit (hook may not be file-related)
    process.exit(0);
  }

  // Skip non-source files
  if (!isSourceFile(filePath)) {
    log.result(`✅ Skipped non-source file: ${filePath}`);
    process.exit(0);
  }

  // Skip if file doesn't exist
  if (!existsSync(filePath)) {
    log.result(`✅ Skipped - file doesn't exist: ${filePath}`);
    process.exit(0);
  }

  const fileName = filePath.split("/").pop() || filePath;
  log.info(`🔍 Checking: ${fileName}`);
  log.info("────────────────────────────────────────────");

  try {
    await validate(VALIDATION_VERBS.POSTEDIT, { postedit: true }, [filePath]);
    log.result(`\n✅ ${fileName} passed all checks`);
    process.exit(0);
  } catch {
    // Show agent-friendly fix instructions (always shown - agent needs these)
    log.error("\n═══ Fix These Issues ═══");
    log.error("1. Fix TypeScript errors first (they may cause ESLint false positives)");
    log.error("2. Then fix any remaining ESLint errors");
    log.error("3. Save the file to trigger another check");
    process.exit(2); // Exit 2 for hook failures
  }
}

/**
 * CLI entry point - sets up commander and runs validation
 */
async function main(): Promise<void> {
  // Check for postedit verb early (before commander parsing)
  if (process.argv[2] === VALIDATION_VERBS.POSTEDIT) {
    await runPosteditValidation();
    return;
  }

  const program = new Command();

  program
    .name("validate")
    .description("Build-time validation script for TypeScript, ESLint, and layout files")
    .version("1.0.0");

  // Global options
  program
    .option(
      "-s, --scope <type>",
      "validation scope (production files only or full codebase)",
      (value: string): ValidationScope => {
        if (value === "production" || value === "full") {
          return value as ValidationScope;
        }
        console.error(`Invalid scope "${value}". Must be "production" or "full"`);
        process.exit(1);
      },
    )
    .option("-v, --verbose", "enable verbose logging (info level)")
    .option("-d, --debug", "enable debug logging (debug level)")
    .argument(
      "[verb]",
      `validation type to run (default: ${VALIDATION_VERBS.ALL})`,
      VALIDATION_VERBS.ALL,
    )
    .argument("[files...]", "files or directories to validate (supports TypeScript files)")
    .addHelpText(
      "after",
      `
Examples:
  $ validate                                    # Run all validations
  $ validate --scope production               # Run with production scope
  $ validate --verbose typecheck              # Run TypeScript validation with verbose output
  $ validate lint -- src/ lib/               # Run ESLint on directories
  $ validate typecheck -- file1.ts -weird.ts # Validate specific files (use -- for files starting with -)
  $ validate --debug knip                     # Run knip with debug output

Environment Variables (for backward compatibility):
  ESLINT_VALIDATION_ENABLED=0                # Disable ESLint validation
  TYPESCRIPT_VALIDATION_ENABLED=0            # Disable TypeScript validation
  KNIP_VALIDATION_ENABLED=0                  # Disable knip validation

Supported validation verbs:
  all        Run all validations (default)
  typecheck  Run TypeScript validation only
  lint       Run ESLint validation only
  knip       Run knip unused code detection only
`,
    );

  program.action(async (verbArg: ValidationVerb, filesArg: string[], options: CliOptions) => {
    let verb: ValidationVerb = verbArg,
      files: string[] = filesArg;

    // Validate verb argument
    const validVerbs = Object.values(VALIDATION_VERBS);
    if (!validVerbs.includes(verbArg)) {
      // Check if this is a file or directory argument
      if (existsSync(verbArg)) {
        files = [verbArg, ...filesArg];
        verbArg = "all";
      } else {
        console.error(
          `Invalid validation verb "${verbArg}". Must be one of: ${validVerbs.join(", ")}`,
        );
        process.exit(1);
      }
    }

    // Run validation
    try {
      await validate(verb, options, files);
      // Explicitly exit with success code when validation completes
      process.exit(0);
    } catch (error) {
      // Clean error reporting without stack trace
      if (error instanceof Error && error.message === "Build-time validation failed") {
        // Already logged by the validation system, just exit
        process.exit(1);
      } else {
        // Unexpected error, show details
        console.error("❌ Unexpected validation error:", {}, error);
        process.exit(1);
      }
    }
  });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Execute if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("❌ Script execution failed:", {}, error);
    process.exit(1);
  });
}

export { validate };
