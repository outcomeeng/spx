/**
 * TypeScript scope resolution for validation.
 *
 * Provides functions to determine which directories should be validated
 * based on tsconfig.json settings, ensuring alignment between TypeScript
 * and ESLint validation.
 *
 * @module validation/config/scope
 */

import * as JSONC from "jsonc-parser";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import type { ScopeConfig, ValidationScope } from "../types";
import { pathPassesValidationFilter } from "./path-filter";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * TSConfig file paths for each validation scope.
 */
export const TSCONFIG_FILES = {
  full: "tsconfig.json",
  production: "tsconfig.production.json",
} as const;
const PATH_SEGMENT_SEPARATOR = "/";
export const GLOB_MARKER = "*";
export const RECURSIVE_GLOB_SEGMENT = "**";
export const SINGLE_CHARACTER_GLOB_MARKER = "?";
export const TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX = "/**/*";
const GLOB_REGEX_SPECIAL_CHARACTER_PATTERN = /[.+?^${}()|[\]\\]/gu;
const REGEX_ESCAPE_REPLACEMENT = String.raw`\$&`;
const HIDDEN_PATH_PREFIX = ".";
const TERMINAL_EXTENSION_PATTERN = /\.[^.]+$/u;
const TYPESCRIPT_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;
const TYPESCRIPT_DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"] as const;
const GLOB_DIRECTORY_MATCH_CACHE_KEY_SEPARATOR = "\u0000";
export const TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME = "__spx_scope_probe__.ts";
export const TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.mts",
  "**/*.cts",
] as const;

// =============================================================================
// DEPENDENCY INJECTION INTERFACES
// =============================================================================

/**
 * Dependencies for scope resolution.
 *
 * Enables dependency injection for testing without mocking.
 */
export interface ScopeDeps {
  readFileSync: typeof readFileSync;
  existsSync: typeof existsSync;
  readdirSync: typeof readdirSync;
}

/**
 * Default production dependencies.
 */
export const defaultScopeDeps: ScopeDeps = {
  readFileSync,
  existsSync,
  readdirSync,
};

// =============================================================================
// TYPES
// =============================================================================

interface TypeScriptConfig {
  include?: string[];
  exclude?: string[];
  extends?: string | string[];
}

function resolveProjectPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? path : join(projectRoot, path);
}

// =============================================================================
// INTERNAL FUNCTIONS
// =============================================================================

/**
 * Parse TypeScript configuration using proper JSONC parser.
 *
 * @param configPath - Path to tsconfig file
 * @param deps - Injectable dependencies
 * @returns Parsed TypeScript configuration
 */
export function parseTypeScriptConfig(
  configPath: string,
  deps: ScopeDeps = defaultScopeDeps,
): TypeScriptConfig {
  try {
    const configContent = deps.readFileSync(configPath, "utf-8");
    const parsed = JSONC.parse(configContent) as TypeScriptConfig;
    return parsed;
  } catch {
    // Fallback: return minimal config and let directory detection work
    return {
      include: [...TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS],
      exclude: ["node_modules/**", ".pnpm-store/**", "dist/**"],
    };
  }
}

/**
 * Resolve complete TypeScript configuration including extends.
 *
 * @param scope - Validation scope
 * @param deps - Injectable dependencies
 * @returns Resolved TypeScript configuration
 */
export function resolveTypeScriptConfig(
  scope: ValidationScope,
  projectRoot: string,
  deps: ScopeDeps = defaultScopeDeps,
): TypeScriptConfig {
  const configFile = TSCONFIG_FILES[scope];
  const config = parseTypeScriptConfig(resolveProjectPath(projectRoot, configFile), deps);

  if (config.extends) {
    const baseConfigs = normalizeExtends(config.extends)
      .map((extendedConfig) => parseTypeScriptConfig(resolveProjectPath(projectRoot, extendedConfig), deps));
    // TypeScript applies later extended configs after earlier ones; include
    // and exclude arrays replace instead of merge, so the last inherited
    // field wins.
    const inheritedInclude = [...baseConfigs].reverse().find((baseConfig) => baseConfig.include !== undefined)?.include
      ?? [];
    const inheritedExclude = [...baseConfigs].reverse().find((baseConfig) => baseConfig.exclude !== undefined)?.exclude
      ?? [];
    return {
      include: config.include ?? inheritedInclude,
      exclude: config.exclude ?? inheritedExclude,
    };
  }

  return {
    include: config.include ?? [],
    exclude: config.exclude ?? [],
  };
}

function normalizeExtends(extendsConfig: string | string[]): readonly string[] {
  return Array.isArray(extendsConfig) ? extendsConfig : [extendsConfig];
}

/**
 * Check if a directory contains TypeScript files recursively.
 *
 * @param dirPath - Directory to check
 * @param maxDepth - Maximum recursion depth
 * @param deps - Injectable dependencies
 * @returns True if directory contains TypeScript files
 */
export function hasTypeScriptFilesRecursive(
  dirPath: string,
  maxDepth: number = 2,
  deps: ScopeDeps = defaultScopeDeps,
): boolean {
  if (maxDepth <= 0) return false;

  try {
    const items = deps.readdirSync(dirPath, { withFileTypes: true });

    // Check for TypeScript files in current directory
    const hasDirectTsFiles = items.some(
      (item) => item.isFile() && pathHasTypeScriptSourceExtension(item.name),
    );

    if (hasDirectTsFiles) return true;

    // Check subdirectories (limited depth to avoid performance issues)
    const subdirs = items.filter((item) => item.isDirectory() && !item.name.startsWith("."));
    for (const subdir of subdirs.slice(0, 5)) {
      // Limit to first 5 subdirs
      if (hasTypeScriptFilesRecursive(join(dirPath, subdir.name), maxDepth - 1, deps)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get top-level directories containing TypeScript files.
 *
 * @param config - TypeScript configuration
 * @param deps - Injectable dependencies
 * @returns Array of directory names
 */
export function getTopLevelDirectoriesWithTypeScript(
  config: TypeScriptConfig,
  projectRoot: string,
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  const allTopLevelItems = deps.readdirSync(projectRoot, { withFileTypes: true });
  const directories = new Set<string>();

  // Find all top-level directories
  const topLevelDirs = allTopLevelItems
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => !name.startsWith("."));

  // Check if each directory should be included based on tsconfig include/exclude patterns
  for (const dir of topLevelDirs) {
    if (!directoryPassesIncludePatterns(dir, config.include ?? [], projectRoot, deps)) {
      continue;
    }

    // Check if directory is explicitly excluded
    const isExcluded = config.exclude?.some((pattern) => {
      // Handle directory-recursive patterns like "docs/**/*"
      if (pattern.includes("/**")) {
        const dirPattern = pattern.split("/**")[0];
        return dirPattern === dir;
      }
      // Handle exact matches and directory patterns
      return pattern === dir || pattern.startsWith(dir + "/") || pattern === dir + "/**";
    });

    if (!isExcluded) {
      // Check if directory has TypeScript files
      try {
        const hasTypeScriptFiles = hasTypeScriptFilesRecursive(join(projectRoot, dir), 2, deps);
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
      if (
        includePatternTargetsTypeScriptScope(pattern, projectRoot, deps)
        && pattern.includes(PATH_SEGMENT_SEPARATOR)
      ) {
        const topLevelDir = getLiteralTopLevelPatternDirectory(pattern);
        if (topLevelDir) {
          directories.add(topLevelDir);
        }
      }
    }
  }

  return Array.from(directories).sort();
}

function getLiteralTopLevelPatternDirectory(pattern: string): string | null {
  const topLevelDir = pattern.split(PATH_SEGMENT_SEPARATOR)[0];
  if (!topLevelDir || typeScriptScopePatternHasGlob(topLevelDir) || topLevelDir.startsWith(HIDDEN_PATH_PREFIX)) {
    return null;
  }
  return topLevelDir;
}

function directoryPassesIncludePatterns(
  directory: string,
  patterns: readonly string[],
  projectRoot: string,
  deps: ScopeDeps,
): boolean {
  return patterns.length === 0
    || patterns.some((pattern) =>
      includePatternTargetsTypeScriptScope(pattern, projectRoot, deps)
      && typeScriptScopePatternIntersectsDirectory(pattern, directory)
    );
}

export function normalizeTypeScriptScopePath(path: string): string {
  return path
    .split(/[\\/]/gu)
    .join(PATH_SEGMENT_SEPARATOR)
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "");
}

function pathMatchesLiteralPrefix(path: string, prefix: string): boolean {
  const normalizedPath = normalizeTypeScriptScopePath(path);
  const normalizedPrefix = normalizeTypeScriptScopePath(prefix);
  return normalizedPath === normalizedPrefix
    || normalizedPath.startsWith(`${normalizedPrefix}${PATH_SEGMENT_SEPARATOR}`);
}

function splitTypeScriptScopePathSegments(path: string): string[] {
  const normalizedPath = normalizeTypeScriptScopePath(path);
  if (normalizedPath.length === 0 || normalizedPath === ".") {
    return [];
  }
  return normalizedPath.split(PATH_SEGMENT_SEPARATOR);
}

function globLiteralPrefix(pattern: string): string {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  const globIndex = firstGlobMarkerIndex(normalizedPattern);
  if (globIndex === -1) {
    return normalizedPattern;
  }
  return normalizedPattern.slice(0, globIndex).replace(/\/+$/u, "");
}

function firstGlobMarkerIndex(path: string): number {
  const globIndex = path.indexOf(GLOB_MARKER);
  const singleCharacterGlobIndex = path.indexOf(SINGLE_CHARACTER_GLOB_MARKER);
  if (globIndex === -1) return singleCharacterGlobIndex;
  if (singleCharacterGlobIndex === -1) return globIndex;
  return Math.min(globIndex, singleCharacterGlobIndex);
}

export function globSegmentMatchesPathSegment(patternSegment: string, pathSegment: string): boolean {
  return typeScriptScopeGlobPatternToRegExp(patternSegment).test(pathSegment);
}

function globPatternCanMatchInsideDirectory(
  patternSegments: readonly string[],
  directorySegments: readonly string[],
  patternIndex = 0,
  directoryIndex = 0,
  cache: Map<string, boolean> = new Map(),
): boolean {
  const cacheKey = [
    patternIndex,
    directoryIndex,
  ].join(GLOB_DIRECTORY_MATCH_CACHE_KEY_SEPARATOR);
  const cachedResult = cache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  let result: boolean;
  if (directoryIndex === directorySegments.length) {
    result = true;
  } else if (patternIndex === patternSegments.length) {
    result = false;
  } else {
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === RECURSIVE_GLOB_SEGMENT) {
      result = globPatternCanMatchInsideDirectory(
        patternSegments,
        directorySegments,
        patternIndex + 1,
        directoryIndex,
        cache,
      )
        || globPatternCanMatchInsideDirectory(
          patternSegments,
          directorySegments,
          patternIndex,
          directoryIndex + 1,
          cache,
        );
    } else {
      const directorySegment = directorySegments[directoryIndex];
      result = directorySegment !== undefined
        && globSegmentMatchesPathSegment(patternSegment, directorySegment)
        && globPatternCanMatchInsideDirectory(
          patternSegments,
          directorySegments,
          patternIndex + 1,
          directoryIndex + 1,
          cache,
        );
    }
  }

  cache.set(cacheKey, result);
  return result;
}

export function typeScriptScopePatternHasGlob(pattern: string): boolean {
  return firstGlobMarkerIndex(pattern) !== -1;
}

export function typeScriptScopeGlobPatternToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  let source = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    const nextCharacter = normalizedPattern[index + 1];
    const followingCharacter = normalizedPattern[index + 2];
    if (character === GLOB_MARKER && nextCharacter === GLOB_MARKER && followingCharacter === PATH_SEGMENT_SEPARATOR) {
      source += `(?:.*${PATH_SEGMENT_SEPARATOR})?`;
      index += 2;
    } else if (character === GLOB_MARKER && nextCharacter === GLOB_MARKER) {
      source += ".*";
      index += 1;
    } else if (character === GLOB_MARKER) {
      source += `[^${PATH_SEGMENT_SEPARATOR}]*`;
    } else if (character === SINGLE_CHARACTER_GLOB_MARKER) {
      source += `[^${PATH_SEGMENT_SEPARATOR}]`;
    } else {
      source += character.replace(GLOB_REGEX_SPECIAL_CHARACTER_PATTERN, REGEX_ESCAPE_REPLACEMENT);
    }
  }
  return new RegExp(`^${source}$`, "u");
}

export function pathMatchesTypeScriptPattern(path: string, pattern: string): boolean {
  if (typeScriptScopePatternHasGlob(pattern)) {
    return typeScriptScopeGlobPatternToRegExp(pattern).test(normalizeTypeScriptScopePath(path));
  }
  const prefix = globLiteralPrefix(pattern);
  return prefix.length === 0 || pathMatchesLiteralPrefix(path, prefix);
}

function typeScriptScopePatternCoversDirectory(pattern: string, directory: string): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  const normalizedDirectory = normalizeTypeScriptScopePath(directory);
  if (!typeScriptScopePatternIntersectsDirectory(normalizedPattern, normalizedDirectory)) {
    return false;
  }
  if (!typeScriptScopePatternHasGlob(normalizedPattern)) {
    return normalizedPattern === normalizedDirectory
      || pathMatchesLiteralPrefix(normalizedDirectory, normalizedPattern);
  }
  const probePath = `${normalizedDirectory}/${TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME}`;
  return pathMatchesTypeScriptPattern(probePath, normalizedPattern);
}

export function typeScriptScopePatternCoversDirectorySourceSet(pattern: string, directory: string): boolean {
  if (!typeScriptScopePatternCoversDirectory(pattern, directory)) {
    return false;
  }
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  if (!typeScriptScopePatternHasGlob(normalizedPattern) && pathHasTypeScriptSourceExtension(normalizedPattern)) {
    return false;
  }
  const patternSegments = splitTypeScriptScopePathSegments(normalizedPattern);
  const terminalSegment = patternSegments.at(-1) ?? normalizedPattern;
  return !TERMINAL_EXTENSION_PATTERN.test(terminalSegment);
}

export function typeScriptScopePatternIntersectsDirectory(pattern: string, directory: string): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  const normalizedDirectory = normalizeTypeScriptScopePath(directory);
  if (!typeScriptScopePatternHasGlob(normalizedPattern)) {
    return pathMatchesLiteralPrefix(normalizedPattern, normalizedDirectory)
      || pathMatchesLiteralPrefix(normalizedDirectory, normalizedPattern);
  }
  return globPatternCanMatchInsideDirectory(
    splitTypeScriptScopePathSegments(normalizedPattern),
    splitTypeScriptScopePathSegments(normalizedDirectory),
  );
}

export function pathHasTypeScriptSourceExtension(path: string): boolean {
  const normalizedPath = normalizeTypeScriptScopePath(path);
  return TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension))
    && !TYPESCRIPT_DECLARATION_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension));
}

export function typeScriptScopePatternTargetsTypeScriptSource(pattern: string): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  if (pathHasTypeScriptSourceExtension(normalizedPattern)) {
    return true;
  }
  if (!typeScriptScopePatternHasGlob(normalizedPattern)) {
    return false;
  }
  const terminalSegment = splitTypeScriptScopePathSegments(normalizedPattern).at(-1) ?? normalizedPattern;
  return typeScriptScopePatternHasGlob(terminalSegment)
    && !TERMINAL_EXTENSION_PATTERN.test(terminalSegment);
}

function includePatternTargetsTypeScriptScope(pattern: string, projectRoot: string, deps: ScopeDeps): boolean {
  return includePatternIsLiteralDirectory(pattern, projectRoot, deps)
    || typeScriptScopePatternTargetsTypeScriptSource(pattern);
}

function includePatternIsLiteralDirectory(pattern: string, projectRoot: string, deps: ScopeDeps): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  return !typeScriptScopePatternHasGlob(normalizedPattern)
    && pathIsDirectory(resolveProjectPath(projectRoot, normalizedPattern), deps);
}

function pathIsDirectory(path: string, deps: ScopeDeps): boolean {
  try {
    deps.readdirSync(path, { withFileTypes: true });
    return true;
  } catch {
    return false;
  }
}

function normalizeActiveIncludePattern(pattern: string, projectRoot: string, deps: ScopeDeps): string {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  return includePatternIsLiteralDirectory(normalizedPattern, projectRoot, deps)
    ? `${normalizedPattern}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`
    : pattern;
}

function filterActiveIncludePatterns(
  patterns: readonly string[],
  excludePatterns: readonly string[],
  projectRoot: string,
  deps: ScopeDeps,
): string[] {
  return patterns
    .map((pattern) => normalizeActiveIncludePattern(pattern, projectRoot, deps))
    .filter((pattern) => typeScriptScopePatternTargetsTypeScriptSource(pattern))
    .filter((pattern) => {
      const topLevelDir = getLiteralTopLevelPatternDirectory(pattern);
      return topLevelDir === null || deps.existsSync(join(projectRoot, topLevelDir));
    })
    .filter((pattern) => pathPassesValidationFilter(pattern, { exclude: excludePatterns }));
}

/**
 * Get validation directories based on tsconfig files.
 *
 * @param scope - Validation scope
 * @param deps - Injectable dependencies
 * @returns Array of directory names to validate
 */
export function getValidationDirectories(
  scope: ValidationScope,
  projectRoot: string,
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  // Get TypeScript configuration for the specified mode
  const config = resolveTypeScriptConfig(scope, projectRoot, deps);

  // Get directories that contain TypeScript files and respect tsconfig exclude patterns
  const configDirectories = getTopLevelDirectoriesWithTypeScript(config, projectRoot, deps);

  // Only include directories that actually exist
  const existingDirectories = configDirectories.filter((dir) => deps.existsSync(join(projectRoot, dir)));

  return existingDirectories;
}

/**
 * Get authoritative validation scope configuration.
 *
 * This is the main entry point for scope resolution. Returns a ScopeConfig
 * object that can be used to configure validation tools.
 *
 * @param scope - Validation scope
 * @param deps - Injectable dependencies
 * @returns Scope configuration
 *
 * @example
 * ```typescript
 * const scopeConfig = getTypeScriptScope("full", projectRoot);
 * console.log(scopeConfig.directories); // ["src", "tests", "scripts"]
 * ```
 */
export function getTypeScriptScope(
  scope: ValidationScope,
  projectRoot: string,
  deps: ScopeDeps = defaultScopeDeps,
): ScopeConfig {
  // Use validation-focused directory selection
  const directories = getValidationDirectories(scope, projectRoot, deps);

  // Read TypeScript config for patterns
  const config = resolveTypeScriptConfig(scope, projectRoot, deps);

  return {
    directories,
    filePatterns: filterActiveIncludePatterns(config.include ?? [], config.exclude ?? [], projectRoot, deps),
    excludePatterns: config.exclude ?? [],
  };
}

export function pathPassesTypeScriptScope(path: string, scopeConfig: ScopeConfig): boolean {
  const typeScriptSourcePatterns = scopeConfig.filePatterns.filter((pattern) =>
    typeScriptScopePatternTargetsTypeScriptSource(pattern)
  );
  const included = typeScriptSourcePatterns.length > 0
    ? typeScriptSourcePatterns.some((pattern) => pathMatchesTypeScriptPattern(path, pattern))
    : scopeConfig.directories.some((directory) => pathMatchesLiteralPrefix(path, directory));
  const excluded = scopeConfig.excludePatterns.some((pattern) => pathMatchesTypeScriptPattern(path, pattern));
  return included && !excluded;
}
