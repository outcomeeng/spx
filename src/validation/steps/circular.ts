/**
 * Circular dependency validation step.
 *
 * Uses dependency-cruiser to detect circular imports in the codebase.
 *
 * @module validation/steps/circular
 */

import {
  cruise as dependencyCruiser,
  type ICruiseOptions,
  type ICruiseResult,
  type IDependency,
} from "dependency-cruiser";
import extractTypeScriptConfig from "dependency-cruiser/config-utl/extract-ts-config";
import { join } from "node:path";

import { compareAsciiStrings } from "@/lib/state-store";
import {
  GLOB_MARKER,
  normalizeTypeScriptScopePath,
  RECURSIVE_GLOB_SEGMENT,
  SINGLE_CHARACTER_GLOB_MARKER,
  TSCONFIG_FILES,
  TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS,
  typeScriptScopePatternHasGlob,
  typeScriptScopePatternIntersectsDirectory,
  typeScriptScopePatternTargetsTypeScriptSource,
} from "../config/scope";
import type { CircularDependencyResult, ScopeConfig, ValidationScope } from "../types";

export const DEPENDENCY_CRUISER_MODULE_SYSTEMS = ["es6", "cjs"] as const;
export const DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES = [...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS] as const;
export const DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN = String.raw`(?<!\.d)\.(?:[cm]?ts|tsx)$`;
export const DEPENDENCY_CRUISER_TYPESCRIPT_DECLARATION_RESOLVE_EXTENSIONS = [
  ".d.ts",
  ".d.mts",
  ".d.cts",
] as const;
export const DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ...DEPENDENCY_CRUISER_TYPESCRIPT_DECLARATION_RESOLVE_EXTENSIONS,
] as const;
const TSCONFIG_EXCLUDE_SUFFIX_PATTERN = /\/\*\*?\/\*$/u;
const LITERAL_REGEX_SPECIAL_CHARACTER_PATTERN = /[.*+?^${}()|[\]\\]/gu;
const REGEX_ESCAPE_REPLACEMENT = String.raw`\$&`;
const CYCLE_KEY_SEPARATOR = "\u0000";
export const DEPENDENCY_CRUISER_PATH_PREFIX_PATTERN = "(^|/)";
const DEPENDENCY_CRUISER_PATH_SEGMENT_SEPARATOR = "/";
const DEPENDENCY_CRUISER_LEADING_RECURSIVE_GLOB_PATTERN = "(?:.*/|)";
const DEPENDENCY_CRUISER_MIDDLE_RECURSIVE_GLOB_PATTERN = "(/.*/|/)";
export const DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN = "(/.*|$)";
export const DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN = "(^|/)node_modules(/|$)";
export const DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR = "dependency-cruiser returned non-structured output";
export const DEPENDENCY_CRUISER_DEPENDENCY_TYPES = {
  AMD_DEFINE: "amd-define",
  AMD_EXOTIC_REQUIRE: "amd-exotic-require",
  AMD_REQUIRE: "amd-require",
  DYNAMIC_IMPORT: "dynamic-import",
  EXPORT: "export",
  EXOTIC_REQUIRE: "exotic-require",
  IMPORT: "import",
  IMPORT_EQUALS: "import-equals",
  LOCAL: "local",
  PRE_COMPILATION_ONLY: "pre-compilation-only",
  REQUIRE: "require",
  TYPE_IMPORT: "type-import",
  // dependency-cruiser 16.10.4 emits this for TypeScript `import type` edges.
  TYPE_ONLY: "type-only",
} as const;
export const DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS = "specify";
const ERASURE_ONLY_DEPENDENCY_TYPES: ReadonlySet<string> = new Set([
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_IMPORT,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.TYPE_ONLY,
]);
const RUNTIME_DEPENDENCY_TYPES: ReadonlySet<string> = new Set([
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.AMD_DEFINE,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.AMD_EXOTIC_REQUIRE,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.AMD_REQUIRE,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.DYNAMIC_IMPORT,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.EXPORT,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.EXOTIC_REQUIRE,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.IMPORT_EQUALS,
  DEPENDENCY_CRUISER_DEPENDENCY_TYPES.REQUIRE,
]);

// =============================================================================
// DEPENDENCY INJECTION INTERFACES
// =============================================================================

/**
 * Dependencies for circular dependency validation.
 *
 * Enables dependency injection for testing.
 */
export interface CircularDeps {
  dependencyCruiser: typeof dependencyCruiser;
  extractTypeScriptConfig: typeof extractTypeScriptConfig;
}

export const CIRCULAR_DEPS_KEYS = {
  DEPENDENCY_CRUISER: "dependencyCruiser",
  EXTRACT_TYPESCRIPT_CONFIG: "extractTypeScriptConfig",
} as const;

export type CircularDependencyGraphRunner = CircularDeps[typeof CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER];

/**
 * Default production dependencies.
 */
export const defaultCircularDeps: CircularDeps = {
  [CIRCULAR_DEPS_KEYS.DEPENDENCY_CRUISER]: dependencyCruiser,
  [CIRCULAR_DEPS_KEYS.EXTRACT_TYPESCRIPT_CONFIG]: extractTypeScriptConfig,
};

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

function toDependencyCruiserExcludePatterns(patterns: readonly string[]): string[] {
  return patterns.map((pattern) => {
    const matchesDirectorySubtree = TSCONFIG_EXCLUDE_SUFFIX_PATTERN.test(pattern);
    const cleanPattern = pattern.replace(TSCONFIG_EXCLUDE_SUFFIX_PATTERN, "");
    if (matchesDirectorySubtree || typeScriptScopePatternHasGlob(cleanPattern)) {
      return typeScriptScopeGlobPatternToDependencyCruiserRegExpSource(cleanPattern, matchesDirectorySubtree);
    }
    return cleanPattern.replaceAll(LITERAL_REGEX_SPECIAL_CHARACTER_PATTERN, REGEX_ESCAPE_REPLACEMENT);
  });
}

function typeScriptScopeGlobPatternToDependencyCruiserRegExpSource(
  pattern: string,
  matchesDirectorySubtree: boolean,
): string {
  const segments = normalizeTypeScriptScopePath(pattern).split(DEPENDENCY_CRUISER_PATH_SEGMENT_SEPARATOR);
  const source = segments.reduce((currentSource, segment, index) => {
    const previousSegment = segments[index - 1];
    if (segment === RECURSIVE_GLOB_SEGMENT) {
      if (index === 0) {
        return `${currentSource}${DEPENDENCY_CRUISER_LEADING_RECURSIVE_GLOB_PATTERN}`;
      }
      if (index === segments.length - 1) {
        return `${currentSource}${DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN}`;
      }
      return `${currentSource}${DEPENDENCY_CRUISER_MIDDLE_RECURSIVE_GLOB_PATTERN}`;
    }

    const separator = index > 0 && previousSegment !== RECURSIVE_GLOB_SEGMENT
      ? DEPENDENCY_CRUISER_PATH_SEGMENT_SEPARATOR
      : "";
    return `${currentSource}${separator}${dependencyCruiserGlobSegmentToRegExpSource(segment)}`;
  }, DEPENDENCY_CRUISER_PATH_PREFIX_PATTERN);

  if (matchesDirectorySubtree && segments.at(-1) !== RECURSIVE_GLOB_SEGMENT) {
    return `${source}${DEPENDENCY_CRUISER_TRAILING_RECURSIVE_GLOB_PATTERN}`;
  }
  if (segments.at(-1) === RECURSIVE_GLOB_SEGMENT) {
    return source;
  }
  return `${source}$`;
}

function dependencyCruiserGlobSegmentToRegExpSource(segment: string): string {
  let source = "";
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    const nextCharacter = segment[index + 1];
    if (character === GLOB_MARKER && nextCharacter === GLOB_MARKER) {
      source += ".*";
      index += 1;
    } else if (character === GLOB_MARKER) {
      source += `[^${DEPENDENCY_CRUISER_PATH_SEGMENT_SEPARATOR}]*`;
    } else if (character === SINGLE_CHARACTER_GLOB_MARKER) {
      source += `[^${DEPENDENCY_CRUISER_PATH_SEGMENT_SEPARATOR}]`;
    } else {
      source += character.replaceAll(LITERAL_REGEX_SPECIAL_CHARACTER_PATTERN, REGEX_ESCAPE_REPLACEMENT);
    }
  }
  return source;
}

function buildDependencyCruiserOptions(
  typescriptScope: ScopeConfig,
  productDir: string,
  tsConfigFile: string,
): ICruiseOptions {
  const excludePatterns = [
    DEPENDENCY_CRUISER_PACKAGE_EXCLUDE_PATTERN,
    ...toDependencyCruiserExcludePatterns(typescriptScope.excludePatterns),
  ];

  return {
    baseDir: productDir,
    enhancedResolveOptions: { extensions: [...DEPENDENCY_CRUISER_TYPESCRIPT_RESOLVE_EXTENSIONS] },
    exclude: { path: excludePatterns },
    includeOnly: { path: DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_PATTERN },
    moduleSystems: [...DEPENDENCY_CRUISER_MODULE_SYSTEMS],
    tsConfig: { fileName: tsConfigFile },
    tsPreCompilationDeps: DEPENDENCY_CRUISER_TS_PRE_COMPILATION_DEPS,
  };
}

function toDependencyCruiserSourcePatterns(typescriptScope: ScopeConfig): string[] {
  const typeScriptFilePatterns = typescriptScope.filePatterns.filter((pattern) =>
    typeScriptScopePatternTargetsTypeScriptSource(pattern)
  );
  const directoryIsConstrainedByGlobPattern = (directory: string): boolean =>
    typeScriptFilePatterns.some((pattern) =>
      typeScriptScopePatternHasGlob(pattern)
      && typeScriptScopePatternIntersectsDirectory(pattern, directory)
    );
  const retainedDirectories = typescriptScope.directories.filter((directory) =>
    !directoryIsConstrainedByGlobPattern(directory)
  );
  const directoryPatterns = retainedDirectories.flatMap((directory) =>
    DEPENDENCY_CRUISER_TYPESCRIPT_SOURCE_GLOB_SUFFIXES.map((suffix) => `${directory}/${suffix}`)
  );
  const explicitFilePatterns = typeScriptFilePatterns.filter((pattern) =>
    !patternIsCoveredByDirectory(pattern, retainedDirectories)
  );
  return [...directoryPatterns, ...explicitFilePatterns];
}

function patternIsCoveredByDirectory(pattern: string, directories: readonly string[]): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  return directories.some((directory) => {
    const normalizedDirectory = normalizeTypeScriptScopePath(directory);
    return normalizedPattern === normalizedDirectory
      || normalizedPattern.startsWith(`${normalizedDirectory}/`);
  });
}

function isCruiseResult(output: unknown): output is ICruiseResult {
  return output !== null && typeof output === "object" && "modules" in output && "summary" in output;
}

function closeCycle(cycle: readonly string[]): string[] {
  const first = cycle.at(0);
  const last = cycle.at(-1);
  if (first === undefined) {
    return [];
  }
  return last === first ? [...cycle] : [...cycle, first];
}

function dependencyTypesSurviveRuntime(dependencyTypes: readonly string[]): boolean {
  // PRE_COMPILATION_ONLY means dependency-cruiser found no emitted JavaScript
  // edge. TYPE_IMPORT and TYPE_ONLY may be merged with a value edge, so runtime
  // labels remain authoritative for those mixed dependency records.
  if (dependencyTypes.includes(DEPENDENCY_CRUISER_DEPENDENCY_TYPES.PRE_COMPILATION_ONLY)) {
    return false;
  }
  if (dependencyTypes.some((dependencyType) => RUNTIME_DEPENDENCY_TYPES.has(dependencyType))) {
    return true;
  }
  return dependencyTypes.every((dependencyType) => !ERASURE_ONLY_DEPENDENCY_TYPES.has(dependencyType));
}

function dependencySurvivesRuntime(dependency: IDependency): boolean {
  return !dependency.typeOnly && !dependency.preCompilationOnly;
}

function dependencyCycleSurvivesRuntime(dependency: IDependency): boolean {
  return dependencySurvivesRuntime(dependency)
    && (dependency.cycle?.every((cycleDependency) => dependencyTypesSurviveRuntime(cycleDependency.dependencyTypes))
      ?? true);
}

function dependencyCycleForModule(moduleSource: string, dependency: IDependency): string[] | null {
  if (!dependency.circular || !dependencyCycleSurvivesRuntime(dependency)) {
    return null;
  }
  const cycleTail = dependency.cycle?.map((cycleDependency) => cycleDependency.name) ?? [dependency.resolved];
  return closeCycle([moduleSource, ...cycleTail]);
}

function openCycle(cycle: readonly string[]): string[] {
  if (cycle.length > 1 && cycle[0] === cycle.at(-1)) {
    return cycle.slice(0, -1);
  }
  return [...cycle];
}

function cycleRotations(cycle: readonly string[]): string[] {
  return cycle.map((_, index) =>
    [
      ...cycle.slice(index),
      ...cycle.slice(0, index),
    ].join(CYCLE_KEY_SEPARATOR)
  );
}

function canonicalCycleKey(cycle: readonly string[]): string {
  const opened = openCycle(cycle);
  const reversed = [...opened].reverse();
  const keys = [...cycleRotations(opened), ...cycleRotations(reversed)].sort(compareAsciiStrings);
  return keys[0] ?? "";
}

function uniqueCycles(cycles: readonly string[][]): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const cycle of cycles) {
    const key = canonicalCycleKey(cycle);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cycle);
    }
  }
  return result;
}

function circularDependencyCycles(result: ICruiseResult): string[][] {
  const cycles = result.modules.flatMap((module) =>
    module.dependencies.flatMap((dependency) => {
      const cycle = dependencyCycleForModule(module.source, dependency);
      return cycle === null ? [] : [cycle];
    })
  );
  return uniqueCycles(cycles);
}

/**
 * Validate circular dependencies using TypeScript-derived scope.
 *
 * @param scope - Validation scope
 * @param typescriptScope - Scope configuration from tsconfig
 * @param productDir - Product directory for dependency-cruiser input and tsconfig resolution
 * @param deps - Injectable dependencies
 * @returns Result with success status and any circular dependencies found
 *
 * @example
 * ```typescript
 * const result = await validateCircularDependencies("full", scopeConfig);
 * if (!result.success) {
 *   console.error("Found circular dependencies:", result.circularDependencies);
 * }
 * ```
 */
export async function validateCircularDependencies(
  scope: ValidationScope,
  typescriptScope: ScopeConfig,
  productDir: string,
  deps: CircularDeps = defaultCircularDeps,
): Promise<CircularDependencyResult> {
  try {
    const analyzeSourcePatterns = toDependencyCruiserSourcePatterns(typescriptScope);

    if (analyzeSourcePatterns.length === 0) {
      return { success: true };
    }

    const tsConfigFile = join(productDir, TSCONFIG_FILES[scope]);
    const result = await deps.dependencyCruiser(
      analyzeSourcePatterns,
      buildDependencyCruiserOptions(typescriptScope, productDir, tsConfigFile),
      undefined,
      { tsConfig: deps.extractTypeScriptConfig(tsConfigFile) },
    );
    if (!isCruiseResult(result.output)) {
      return { success: false, error: DEPENDENCY_CRUISER_NON_STRUCTURED_OUTPUT_ERROR };
    }
    const circular = circularDependencyCycles(result.output);

    if (circular.length === 0) {
      return { success: true };
    } else {
      return {
        success: false,
        error: `Found ${circular.length} circular dependency cycle(s)`,
        circularDependencies: circular,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
