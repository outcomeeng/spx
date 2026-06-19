/**
 * Circular dependency check command.
 *
 * Runs dependency-cruiser to detect circular dependencies.
 */
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

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
  getTypeScriptScope,
  normalizeTypeScriptScopePath,
  pathHasTypeScriptSourceExtension,
  pathPassesTypeScriptScope,
  TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME,
  typeScriptScopePatternCoversDirectorySourceSet,
  typeScriptScopePatternIntersectsDirectory,
  typeScriptScopePatternTargetsTypeScriptSource,
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

const EXPLICIT_PATH_TARGET_KIND = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

const DEPENDENCY_CRUISER_PACKAGE_NAME = "dependency-cruiser";
const PROJECT_ROOT_SCOPE_PATH = ".";

function pathIsDirectoryOperand(projectRoot: string, relativePath: string): boolean {
  const candidatePath = join(projectRoot, relativePath);
  return existsSync(candidatePath) && statSync(candidatePath).isDirectory();
}

function pathStaysInsideProject(projectRoot: string, path: string): boolean {
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(projectRoot, path);
  const relativePath = relative(projectRoot, resolvedPath);
  const segments = normalizeTypeScriptScopePath(relativePath).split("/");
  return relativePath.length === 0 || (!segments.includes("..") && !isAbsolute(relativePath));
}

function toCanonicalProjectRelativePath(projectRoot: string, path: string): string {
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(projectRoot, path);
  const relativePath = relative(projectRoot, resolvedPath);
  return relativePath.length === 0
    ? PROJECT_ROOT_SCOPE_PATH
    : normalizeTypeScriptScopePath(relativePath);
}

function toExplicitScopeConfig(
  scopeConfig: ReturnType<typeof getTypeScriptScope>,
  targets: readonly ExplicitPathTarget[],
): ReturnType<typeof getTypeScriptScope> {
  const directoryTargets = targets
    .filter((target) => target.kind === EXPLICIT_PATH_TARGET_KIND.DIRECTORY)
    .map((target) => target.path);
  if (directoryTargets.includes(PROJECT_ROOT_SCOPE_PATH)) {
    return scopeConfig;
  }
  const patternMatchesDirectoryTarget = (pattern: string, directory: string): boolean =>
    normalizeTypeScriptScopePath(pattern) === normalizeTypeScriptScopePath(directory);
  const directoryIsCoveredByPattern = (directory: string): boolean =>
    scopeConfig.filePatterns.some((pattern) => typeScriptScopePatternCoversDirectorySourceSet(pattern, directory));
  const scopedFilePatternsForDirectoryTargets = scopeConfig.filePatterns.filter((pattern) =>
    directoryTargets.some((directory) =>
      !patternMatchesDirectoryTarget(pattern, directory)
      && !directoryIsCoveredByPattern(directory)
      && typeScriptScopePatternTargetsTypeScriptSource(pattern)
      && typeScriptScopePatternIntersectsDirectory(pattern, directory)
    )
  );
  const narrowedDirectories = new Set(
    directoryTargets.filter((directory) =>
      !directoryIsCoveredByPattern(directory)
      &&
      scopedFilePatternsForDirectoryTargets.some((pattern) =>
        typeScriptScopePatternIntersectsDirectory(pattern, directory)
      )
    ),
  );
  const retainedDirectories = directoryTargets.filter((directory) => !narrowedDirectories.has(directory));
  const explicitFileTargets = targets
    .filter((target) => target.kind === EXPLICIT_PATH_TARGET_KIND.FILE)
    .map((target) => target.path)
    .filter((path) =>
      !retainedDirectories.some((directory) =>
        path === directory || path.startsWith(`${directory}/`)
      )
    );
  return {
    ...scopeConfig,
    directories: retainedDirectories,
    filePatterns: [
      ...scopedFilePatternsForDirectoryTargets,
      ...explicitFileTargets,
    ],
  };
}

interface ExplicitPathTarget {
  readonly kind: (typeof EXPLICIT_PATH_TARGET_KIND)[keyof typeof EXPLICIT_PATH_TARGET_KIND];
  readonly path: string;
}

function toExplicitPathTarget(projectRoot: string, originalPath: string): ExplicitPathTarget {
  const path = toCanonicalProjectRelativePath(projectRoot, originalPath);
  return {
    kind: pathIsDirectoryOperand(projectRoot, path)
      ? EXPLICIT_PATH_TARGET_KIND.DIRECTORY
      : EXPLICIT_PATH_TARGET_KIND.FILE,
    path,
  };
}

function targetPassesTypeScriptSourceKind(target: ExplicitPathTarget): boolean {
  return target.kind === EXPLICIT_PATH_TARGET_KIND.DIRECTORY || pathHasTypeScriptSourceExtension(target.path);
}

function targetPassesTypeScriptScope(target: ExplicitPathTarget, scopeConfig: TypeScriptScopeConfig): boolean {
  if (target.kind === EXPLICIT_PATH_TARGET_KIND.FILE) {
    return pathPassesTypeScriptScope(target.path, scopeConfig);
  }
  if (target.path === PROJECT_ROOT_SCOPE_PATH) {
    return scopeConfig.directories.length > 0 || scopeConfig.filePatterns.length > 0;
  }
  return pathPassesTypeScriptScope(join(target.path, TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME), scopeConfig)
    || scopeConfig.filePatterns.some((pattern) => typeScriptScopePatternIntersectsDirectory(pattern, target.path));
}

function targetPassesProjectBoundary(projectRoot: string, originalPath: string): boolean {
  return pathStaysInsideProject(projectRoot, originalPath);
}

function filterExplicitPathTargets(
  projectRoot: string,
  files: readonly string[] | undefined,
  validationPathFilter: ReturnType<typeof validationPathFilterForTool>,
  scopeConfig: TypeScriptScopeConfig,
): ExplicitPathTarget[] | undefined {
  return files
    ?.filter((file) => targetPassesProjectBoundary(projectRoot, file))
    .map((file) => toExplicitPathTarget(projectRoot, file))
    .filter((target) => targetPassesTypeScriptSourceKind(target))
    .filter((target) => pathPassesValidationFilter(target.path, validationPathFilter))
    .filter((target) => targetPassesTypeScriptScope(target, scopeConfig));
}

function explicitTargetsAreEmpty(
  files: readonly string[] | undefined,
  targets: readonly ExplicitPathTarget[] | undefined,
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
    ? toExplicitScopeConfig(scopeConfig, filteredTargets)
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
