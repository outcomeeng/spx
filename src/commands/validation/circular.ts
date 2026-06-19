/**
 * Circular dependency check command.
 *
 * Runs dependency-cruiser to detect circular dependencies.
 */
import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import {
  applyValidationPathFilterToScope,
  pathPassesValidationFilter,
  toProjectRelativeValidationPath,
  validationPathFilterForTool,
} from "@/validation/config/path-filter";
import {
  getTypeScriptScope,
  normalizeTypeScriptScopePath,
  pathHasTypeScriptSourceExtension,
  pathPassesTypeScriptScope,
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

function toExplicitScopeConfig(
  scopeConfig: ReturnType<typeof getTypeScriptScope>,
  paths: readonly string[],
): ReturnType<typeof getTypeScriptScope> {
  return {
    ...scopeConfig,
    directories: paths.filter((path) => !pathHasTypeScriptSourceExtension(path)),
    filePatterns: paths.filter((path) => pathHasTypeScriptSourceExtension(path)),
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
  const toolResult = await discoverTool("dependency-cruiser", { projectRoot: cwd });
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
  const validationPathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.CIRCULAR,
  );
  const scopeConfig = applyValidationPathFilterToScope(
    getTypeScriptScope(scope, cwd),
    validationPathFilter,
  );
  const filteredFiles = files
    ?.map((file) => toProjectRelativeValidationPath(cwd, file))
    .map((file) => normalizeTypeScriptScopePath(file))
    .filter((file) => pathPassesValidationFilter(file, validationPathFilter))
    .filter((file) => pathPassesTypeScriptScope(file, scopeConfig));

  if (
    scopeConfig.filteredByValidationPathNoMatches
    || (files !== undefined && files.length > 0 && filteredFiles?.length === 0)
  ) {
    return {
      exitCode: 0,
      output: quiet ? "" : CIRCULAR_VALIDATION_PATHS_NO_TARGETS_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }
  const effectiveScopeConfig = filteredFiles !== undefined && filteredFiles.length > 0
    ? toExplicitScopeConfig(scopeConfig, filteredFiles)
    : scopeConfig;

  // Run circular dependency validation
  const result = await deps.validateCircularDependencies(scope, effectiveScopeConfig, cwd);
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND;
    return { exitCode: 0, output, durationMs };
  } else {
    // Format circular dependency output
    let output = result.error ?? CIRCULAR_DEPENDENCY_OUTPUT.FOUND;
    if (result.circularDependencies && result.circularDependencies.length > 0) {
      const cycles = result.circularDependencies
        .map((cycle) => `  ${cycle.join(" → ")}`)
        .join("\n");
      output = `${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:\n${cycles}`;
    }
    return { exitCode: 1, output, durationMs };
  }
}
