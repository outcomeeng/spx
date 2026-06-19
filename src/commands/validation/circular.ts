/**
 * Circular dependency check command.
 *
 * Runs dependency-cruiser to detect circular dependencies.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import {
  applyValidationPathFilterToScope,
  pathPassesValidationFilter,
  validationPathFilterForTool,
} from "@/validation/config/path-filter";
import {
  constrainTypeScriptScopeToExplicitTargets,
  EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND,
  explicitTypeScriptScopeTargetPassesScope,
  explicitTypeScriptScopeTargetPassesSourceKind,
  type ExplicitTypeScriptScopeTarget,
  getTypeScriptScope,
  pathStaysInsideTypeScriptScopeRoot,
  toProjectRelativeTypeScriptScopePath,
} from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateCircularDependencies } from "@/validation/steps/circular";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { CircularCommandOptions, ValidationCommandResult } from "./types";

type TypeScriptScopeConfig = ReturnType<typeof getTypeScriptScope>;
type CircularValidationResult = Awaited<ReturnType<typeof validateCircularDependencies>>;

const TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR);
const CIRCULAR_CONFIG_ERROR_MESSAGE = `${VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR}: ✗ config error`;
const CIRCULAR_VALIDATION_PATHS_NO_TARGETS_MESSAGE = formatValidationPathsNoTargetsSkipMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
);
export const CIRCULAR_DEPENDENCY_OUTPUT = {
  FOUND: VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND,
} as const;

export interface CircularCommandDeps {
  readonly validateCircularDependencies: typeof validateCircularDependencies;
}

export const defaultCircularCommandDeps: CircularCommandDeps = {
  validateCircularDependencies,
};

const DEPENDENCY_CRUISER_PACKAGE_NAME = "dependency-cruiser";

function pathIsDirectoryOperand(projectRoot: string, relativePath: string): boolean {
  try {
    return statSync(join(projectRoot, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

function pathExistsOperand(projectRoot: string, relativePath: string): boolean {
  return existsSync(join(projectRoot, relativePath));
}

function toExplicitPathTarget(projectRoot: string, originalPath: string): ExplicitTypeScriptScopeTarget {
  const path = toProjectRelativeTypeScriptScopePath(projectRoot, originalPath);
  return {
    kind: pathIsDirectoryOperand(projectRoot, path)
      ? EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY
      : EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE,
    path,
  };
}

function targetPassesProjectBoundary(projectRoot: string, originalPath: string): boolean {
  return pathStaysInsideTypeScriptScopeRoot(projectRoot, originalPath);
}

function filterExplicitPathTargets(
  projectRoot: string,
  files: readonly string[] | undefined,
  validationPathFilter: ReturnType<typeof validationPathFilterForTool>,
  scopeConfig: TypeScriptScopeConfig,
): ExplicitTypeScriptScopeTarget[] | undefined {
  if (files === undefined) {
    return undefined;
  }
  return files
    .filter((file) => targetPassesProjectBoundary(projectRoot, file))
    .map((file) => toExplicitPathTarget(projectRoot, file))
    .filter((target) => pathExistsOperand(projectRoot, target.path))
    .filter((target) => explicitTypeScriptScopeTargetPassesSourceKind(target))
    .filter((target) => pathPassesValidationFilter(target.path, validationPathFilter))
    .filter((target) => explicitTypeScriptScopeTargetPassesScope(target, scopeConfig));
}

function explicitTargetsAreEmpty(
  files: readonly string[] | undefined,
  targets: readonly ExplicitTypeScriptScopeTarget[] | undefined,
): boolean {
  return files !== undefined && files.length > 0 && targets?.length === 0;
}

function resolveEffectiveScopeConfig(
  projectRoot: string,
  scope: (typeof VALIDATION_SCOPES)[keyof typeof VALIDATION_SCOPES],
  files: readonly string[] | undefined,
  validationConfig: ValidationConfig,
): TypeScriptScopeConfig | undefined {
  const validationPathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.CIRCULAR,
  );
  const scopeConfig = applyValidationPathFilterToScope(
    getTypeScriptScope(scope, projectRoot),
    validationPathFilter,
  );
  const filteredTargets = filterExplicitPathTargets(projectRoot, files, validationPathFilter, scopeConfig);

  if (scopeConfig.filteredByValidationPathNoMatches || explicitTargetsAreEmpty(files, filteredTargets)) {
    return undefined;
  }

  return filteredTargets !== undefined && filteredTargets.length > 0
    ? constrainTypeScriptScopeToExplicitTargets(scopeConfig, filteredTargets)
    : scopeConfig;
}

function formatCircularValidationResult(result: CircularValidationResult, quiet: boolean): {
  readonly exitCode: number;
  readonly output: string;
} {
  if (result.success) {
    return {
      exitCode: 0,
      output: quiet ? "" : VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND,
    };
  }

  if (result.circularDependencies && result.circularDependencies.length > 0) {
    const cycles = result.circularDependencies
      .map((cycle) => `  ${cycle.join(" → ")}`)
      .join("\n");
    return {
      exitCode: 1,
      output: `${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:\n${cycles}`,
    };
  }

  return {
    exitCode: 1,
    output: result.error ?? CIRCULAR_DEPENDENCY_OUTPUT.FOUND,
  };
}

/**
 * Check for circular dependencies.
 *
 * Gates dependency-cruiser execution on TypeScript language detection:
 * dependency-cruiser walks the TypeScript import graph and has nothing to
 * examine in non-TypeScript projects.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function circularCommand(
  options: CircularCommandOptions,
  deps: CircularCommandDeps = defaultCircularCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, files, quiet, scope = VALIDATION_SCOPES.FULL } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = detectTypeScript(cwd);
  if (!tsDetection.present) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 2: tool discovery.
  const toolResult = await discoverTool(DEPENDENCY_CRUISER_PACKAGE_NAME, { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR, toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${CIRCULAR_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const effectiveScopeConfig = resolveEffectiveScopeConfig(cwd, scope, files, validationConfig);
  if (effectiveScopeConfig === undefined) {
    return {
      exitCode: 0,
      output: quiet ? "" : CIRCULAR_VALIDATION_PATHS_NO_TARGETS_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Run circular dependency validation
  const result = await deps.validateCircularDependencies(scope, effectiveScopeConfig, cwd);
  const durationMs = Date.now() - startTime;
  return { ...formatCircularValidationResult(result, quiet === true), durationMs };
}
