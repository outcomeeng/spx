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
import { isAbsolute, join, relative, resolve } from "node:path";

import { compareAsciiStrings } from "@/lib/state-store";
import type { ValidationPathFilterConfig } from "@/validation/config/descriptor";
import type { ScopeConfig, ValidationScope } from "../types";
import {
  applyValidationPathFilterToScope,
  pathIntersectsValidationFilter,
  pathPassesValidationFilter,
} from "./path-filter";

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
const TYPESCRIPT_SCOPE_DIRECTORY_PROBE_STEM = "__spx_scope_probe__";
export const TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME = `${TYPESCRIPT_SCOPE_DIRECTORY_PROBE_STEM}.ts`;
export const TYPESCRIPT_SCOPE_PROJECT_ROOT = ".";
export const TYPESCRIPT_FALLBACK_INCLUDE_PATTERNS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.mts",
  "**/*.cts",
] as const;
export const TEMPORARY_TSCONFIG_PARENT_SEGMENTS = ["node_modules", ".cache", "spx"] as const;

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

export const EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND = {
  DIRECTORY: "directory",
  FILE: "file",
} as const;

export interface ExplicitTypeScriptScopeTarget {
  readonly kind: (typeof EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND)[keyof typeof EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND];
  readonly path: string;
}

export interface ExplicitTypeScriptScopeTargetFilter {
  readonly productDir: string;
  readonly paths: readonly string[] | undefined;
  readonly validationPathFilter: ValidationPathFilterConfig;
  readonly scopeConfig: ScopeConfig;
  readonly bypassValidationPathFilter?: boolean;
  readonly requireExistingPaths?: boolean;
}

export interface TypeScriptValidationScopeFilter {
  readonly productDir: string;
  readonly scope: ValidationScope;
  readonly paths?: readonly string[];
  readonly validationPathFilter: ValidationPathFilterConfig;
  readonly markExplicitPathsAsValidationFilter?: boolean;
}

interface TypeScriptFileDiscoveryOptions {
  readonly productDir?: string;
  readonly excludePatterns?: readonly string[];
}

interface PatternDirectoryAdvance {
  readonly patternIndex: number;
  readonly recursiveGlobConsumedDirectory: boolean;
}

function resolveProductPath(productDir: string, path: string): string {
  return isAbsolute(path) ? path : join(productDir, path);
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
  productDir: string,
  deps: ScopeDeps = defaultScopeDeps,
): TypeScriptConfig {
  const configFile = TSCONFIG_FILES[scope];
  const config = parseTypeScriptConfig(resolveProductPath(productDir, configFile), deps);

  if (config.extends) {
    const baseConfigs = normalizeExtends(config.extends)
      .map((extendedConfig) => parseTypeScriptConfig(resolveProductPath(productDir, extendedConfig), deps));
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
  options: TypeScriptFileDiscoveryOptions = {},
): boolean {
  if (maxDepth <= 0) return false;

  try {
    const items = deps.readdirSync(dirPath, { withFileTypes: true });

    // Check for TypeScript files in current directory
    const hasDirectTsFiles = items.some(
      (item) =>
        item.isFile()
        && pathHasTypeScriptSourceExtension(item.name)
        && pathPassesTypeScriptFileDiscoveryExcludes(join(dirPath, item.name), options),
    );

    if (hasDirectTsFiles) return true;

    // Check subdirectories (limited depth to avoid performance issues)
    const subdirs = items.filter((item) => item.isDirectory() && !item.name.startsWith("."));
    for (const subdir of subdirs.slice(0, 5)) {
      // Limit to first 5 subdirs
      if (hasTypeScriptFilesRecursive(join(dirPath, subdir.name), maxDepth - 1, deps, options)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function pathPassesTypeScriptFileDiscoveryExcludes(
  path: string,
  options: TypeScriptFileDiscoveryOptions,
): boolean {
  const { excludePatterns = [], productDir } = options;
  if (productDir === undefined) {
    return true;
  }
  const projectRelativePath = toProductRelativeTypeScriptScopePath(productDir, path);
  return !excludePatterns.some((pattern) => pathMatchesTypeScriptPattern(projectRelativePath, pattern));
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
  productDir: string,
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  const directories = new Set<string>();

  for (const dir of listTopLevelDirectories(productDir, deps)) {
    if (directoryContributesTypeScriptScope(dir, config, productDir, deps)) {
      directories.add(dir);
    }
  }

  for (const dir of explicitIncludeTopLevelDirectories(config, productDir, deps)) {
    directories.add(dir);
  }

  return Array.from(directories).sort(compareAsciiStrings);
}

// Top-level directories under the product directory, excluding hidden directories.
function listTopLevelDirectories(productDir: string, deps: ScopeDeps): string[] {
  return deps.readdirSync(productDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => !name.startsWith("."));
}

// A top-level directory contributes scope when tsconfig include patterns admit it
// and it still holds TypeScript files after tsconfig excludes. Directory access
// errors exclude the directory rather than fail discovery.
function directoryContributesTypeScriptScope(
  dir: string,
  config: TypeScriptConfig,
  productDir: string,
  deps: ScopeDeps,
): boolean {
  if (!directoryPassesIncludePatterns(dir, config.include ?? [], productDir, deps)) {
    return false;
  }
  try {
    return hasTypeScriptFilesRecursive(join(productDir, dir), 2, deps, {
      excludePatterns: config.exclude,
      productDir,
    });
  } catch {
    return false;
  }
}

// Top-level directories named literally by include patterns such as
// "scripts/**/*.ts", which the directory scan above does not surface on its own.
function explicitIncludeTopLevelDirectories(
  config: TypeScriptConfig,
  productDir: string,
  deps: ScopeDeps,
): string[] {
  if (!config.include) {
    return [];
  }
  const directories: string[] = [];
  for (const pattern of config.include) {
    if (
      includePatternTargetsTypeScriptScope(pattern, productDir, deps)
      && pattern.includes(PATH_SEGMENT_SEPARATOR)
    ) {
      const topLevelDir = getLiteralTopLevelPatternDirectory(pattern);
      if (topLevelDir) {
        directories.push(topLevelDir);
      }
    }
  }
  return directories;
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
  productDir: string,
  deps: ScopeDeps,
): boolean {
  return patterns.length === 0
    || patterns.some((pattern) =>
      includePatternTargetsTypeScriptScope(pattern, productDir, deps)
      && typeScriptScopePatternIntersectsDirectory(pattern, directory)
    );
}

// Trim trailing path separators without a backtracking-prone regex.
function stripTrailingPathSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === PATH_SEGMENT_SEPARATOR) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function normalizeTypeScriptScopePath(path: string): string {
  const joined = path
    .split(/[\\/]/gu)
    .join(PATH_SEGMENT_SEPARATOR)
    .replace(/^\.\//u, "");
  return stripTrailingPathSeparators(joined);
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
  return stripTrailingPathSeparators(normalizedPattern.slice(0, globIndex));
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
      result = globSegmentMatchesPathSegment(patternSegment, directorySegment)
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
      source += character.replaceAll(GLOB_REGEX_SPECIAL_CHARACTER_PATTERN, REGEX_ESCAPE_REPLACEMENT);
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
  return typeScriptScopePatternMatchesAnyDirectorySourceProbe(normalizedPattern, normalizedDirectory);
}

function typeScriptScopePatternMatchesAnyDirectorySourceProbe(pattern: string, directory: string): boolean {
  return TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) =>
    pathMatchesTypeScriptPattern(`${directory}/${TYPESCRIPT_SCOPE_DIRECTORY_PROBE_STEM}${extension}`, pattern)
  );
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

function includePatternTargetsTypeScriptScope(pattern: string, productDir: string, deps: ScopeDeps): boolean {
  return includePatternIsLiteralDirectory(pattern, productDir, deps)
    || typeScriptScopePatternTargetsTypeScriptSource(pattern);
}

function includePatternIsLiteralDirectory(pattern: string, productDir: string, deps: ScopeDeps): boolean {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  return !typeScriptScopePatternHasGlob(normalizedPattern)
    && pathIsDirectory(resolveProductPath(productDir, normalizedPattern), deps);
}

function pathIsDirectory(path: string, deps: ScopeDeps): boolean {
  try {
    deps.readdirSync(path, { withFileTypes: true });
    return true;
  } catch {
    return false;
  }
}

function normalizeActiveIncludePattern(pattern: string, productDir: string, deps: ScopeDeps): string {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  return includePatternIsLiteralDirectory(normalizedPattern, productDir, deps)
    ? `${normalizedPattern}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`
    : pattern;
}

function filterActiveIncludePatterns(
  patterns: readonly string[],
  excludePatterns: readonly string[],
  productDir: string,
  deps: ScopeDeps,
): string[] {
  return patterns
    .map((pattern) => normalizeActiveIncludePattern(pattern, productDir, deps))
    .filter((pattern) => typeScriptScopePatternTargetsTypeScriptSource(pattern))
    .filter((pattern) => {
      const topLevelDir = getLiteralTopLevelPatternDirectory(pattern);
      return topLevelDir === null || deps.existsSync(join(productDir, topLevelDir));
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
  productDir: string,
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  // Get TypeScript configuration for the specified mode
  const config = resolveTypeScriptConfig(scope, productDir, deps);

  // Get directories that contain TypeScript files and respect tsconfig exclude patterns
  const configDirectories = getTopLevelDirectoriesWithTypeScript(config, productDir, deps);

  // Only include directories that actually exist
  const existingDirectories = configDirectories.filter((dir) => deps.existsSync(join(productDir, dir)));

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
 * const scopeConfig = getTypeScriptScope("full", productDir);
 * console.log(scopeConfig.directories); // ["src", "tests", "scripts"]
 * ```
 */
export function getTypeScriptScope(
  scope: ValidationScope,
  productDir: string,
  deps: ScopeDeps = defaultScopeDeps,
): ScopeConfig {
  // Use validation-focused directory selection
  const directories = getValidationDirectories(scope, productDir, deps);

  // Read TypeScript config for patterns
  const config = resolveTypeScriptConfig(scope, productDir, deps);

  return {
    directories,
    filePatterns: filterActiveIncludePatterns(config.include ?? [], config.exclude ?? [], productDir, deps),
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

export function pathStaysInsideTypeScriptScopeRoot(productDir: string, path: string): boolean {
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(productDir, path);
  const relativePath = relative(productDir, resolvedPath);
  const segments = normalizeTypeScriptScopePath(relativePath).split(PATH_SEGMENT_SEPARATOR);
  return relativePath.length === 0 || (!segments.includes("..") && !isAbsolute(relativePath));
}

export function toProductRelativeTypeScriptScopePath(productDir: string, path: string): string {
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(productDir, path);
  const relativePath = relative(productDir, resolvedPath);
  return relativePath.length === 0
    ? TYPESCRIPT_SCOPE_PROJECT_ROOT
    : normalizeTypeScriptScopePath(relativePath);
}

export function toExplicitTypeScriptScopeTarget(
  productDir: string,
  originalPath: string,
  deps: ScopeDeps = defaultScopeDeps,
): ExplicitTypeScriptScopeTarget {
  const path = toProductRelativeTypeScriptScopePath(productDir, originalPath);
  return {
    kind: pathIsDirectory(resolveProductPath(productDir, path), deps)
      ? EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY
      : EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE,
    path,
  };
}

function explicitTypeScriptScopeTargetExists(
  productDir: string,
  target: ExplicitTypeScriptScopeTarget,
  deps: ScopeDeps,
): boolean {
  return deps.existsSync(resolveProductPath(productDir, target.path));
}

export function filterExplicitTypeScriptScopeTargets(
  filter: ExplicitTypeScriptScopeTargetFilter,
  deps: ScopeDeps = defaultScopeDeps,
): ExplicitTypeScriptScopeTarget[] | undefined {
  const {
    paths,
    productDir,
    requireExistingPaths = true,
    scopeConfig,
    validationPathFilter,
    bypassValidationPathFilter = false,
  } = filter;
  if (paths === undefined) {
    return undefined;
  }
  return paths
    .filter((path) => pathStaysInsideTypeScriptScopeRoot(productDir, path))
    .map((path) => toExplicitTypeScriptScopeTarget(productDir, path, deps))
    .filter((target) => !requireExistingPaths || explicitTypeScriptScopeTargetExists(productDir, target, deps))
    .filter((target) => explicitTypeScriptScopeTargetPassesSourceKind(target))
    .filter((target) =>
      bypassValidationPathFilter
      || explicitTypeScriptScopeTargetIntersectsValidationPathFilter(target, validationPathFilter)
    )
    .filter((target) => explicitTypeScriptScopeTargetPassesScope(target, scopeConfig));
}

function explicitTypeScriptScopeTargetIntersectsValidationPathFilter(
  target: ExplicitTypeScriptScopeTarget,
  validationPathFilter: ValidationPathFilterConfig,
): boolean {
  return target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY
    ? pathIntersectsValidationFilter(target.path, validationPathFilter)
    : pathPassesValidationFilter(target.path, validationPathFilter);
}

export function explicitTypeScriptScopeTargetPassesSourceKind(
  target: ExplicitTypeScriptScopeTarget,
): boolean {
  return target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY
    || pathHasTypeScriptSourceExtension(target.path);
}

export function explicitTypeScriptScopeTargetPassesScope(
  target: ExplicitTypeScriptScopeTarget,
  scopeConfig: ScopeConfig,
): boolean {
  if (target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE) {
    return pathPassesTypeScriptScope(target.path, scopeConfig);
  }
  if (target.path === TYPESCRIPT_SCOPE_PROJECT_ROOT) {
    return scopeConfig.directories.length > 0
      || scopeConfig.filePatterns.some((pattern) => typeScriptScopePatternTargetsTypeScriptSource(pattern));
  }
  const typeScriptSourcePatterns = scopeConfig.filePatterns.filter((pattern) =>
    typeScriptScopePatternTargetsTypeScriptSource(pattern)
  );
  if (!directoryPassesTypeScriptExcludes(target.path, scopeConfig)) {
    return false;
  }
  if (typeScriptSourcePatterns.length > 0) {
    return typeScriptSourcePatterns.some((pattern) => typeScriptScopePatternIntersectsDirectory(pattern, target.path));
  }
  return scopeConfig.directories.some((directory) =>
    pathMatchesLiteralPrefix(directory, target.path) || pathMatchesLiteralPrefix(target.path, directory)
  ) || pathPassesTypeScriptScope(join(target.path, TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME), scopeConfig);
}

function directoryPassesTypeScriptExcludes(directory: string, scopeConfig: ScopeConfig): boolean {
  const probePath = join(directory, TYPESCRIPT_SCOPE_DIRECTORY_PROBE_FILENAME);
  return !scopeConfig.excludePatterns.some((pattern) =>
    typeScriptScopePatternCoversDirectorySourceSet(pattern, directory)
    || pathMatchesTypeScriptPattern(probePath, pattern)
  );
}

export function constrainTypeScriptScopeToExplicitTargets(
  scopeConfig: ScopeConfig,
  targets: readonly ExplicitTypeScriptScopeTarget[],
): ScopeConfig {
  const directoryTargets = targets
    .filter((target) => target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.DIRECTORY)
    .map((target) => target.path);
  if (directoryTargets.includes(TYPESCRIPT_SCOPE_PROJECT_ROOT)) {
    return scopeConfig;
  }
  const patternMatchesDirectoryTarget = (pattern: string, directory: string): boolean =>
    normalizeTypeScriptScopePath(pattern) === normalizeTypeScriptScopePath(directory);
  const scopedFilePatternsForDirectoryTargets = scopeConfig.filePatterns.flatMap((pattern) =>
    directoryTargets
      .filter((directory) =>
        !patternMatchesDirectoryTarget(pattern, directory)
        && typeScriptScopePatternHasGlob(pattern)
        && typeScriptScopePatternTargetsTypeScriptSource(pattern)
        && typeScriptScopePatternIntersectsDirectory(pattern, directory)
      )
      .map((directory) => constrainTypeScriptPatternToDirectory(pattern, directory))
  );
  const narrowedDirectories = new Set(
    directoryTargets.filter((directory) =>
      scopedFilePatternsForDirectoryTargets.some((pattern) =>
        typeScriptScopePatternIntersectsDirectory(pattern, directory)
      )
    ),
  );
  const retainedDirectories = directoryTargets.filter((directory) => !narrowedDirectories.has(directory));
  const retainedDirectoryFilePatterns = scopeConfig.filePatterns.filter((pattern) =>
    !typeScriptScopePatternHasGlob(pattern)
    && pathHasTypeScriptSourceExtension(pattern)
    && retainedDirectories.some((directory) => pathMatchesLiteralPrefix(pattern, directory))
  );
  const retainedDirectoryPatterns = scopeConfig.filePatterns
    .filter((pattern) =>
      !typeScriptScopePatternHasGlob(pattern)
      && !pathHasTypeScriptSourceExtension(pattern)
      && retainedDirectories.some((directory) => pathMatchesLiteralPrefix(pattern, directory))
    )
    .map((pattern) => typeScriptLiteralDirectoryPattern(pattern));
  const retainedDirectoryScopePatterns = retainedDirectories
    .filter((directory) =>
      scopeConfig.filePatterns.some((pattern) =>
        !typeScriptScopePatternHasGlob(pattern)
        && !pathHasTypeScriptSourceExtension(pattern)
        && pathMatchesLiteralPrefix(directory, pattern)
      )
    )
    .map((directory) => typeScriptLiteralDirectoryPattern(directory));
  const retainedDirectoryOperandPatterns = scopeConfig.filePatterns.length === 0
    ? retainedDirectories.map(typeScriptLiteralDirectoryPattern)
    : [];
  const explicitFileTargets = targets
    .filter((target) => target.kind === EXPLICIT_TYPESCRIPT_SCOPE_TARGET_KIND.FILE)
    .map((target) => target.path)
    .filter((path) =>
      !retainedDirectories.some((directory) =>
        path === directory || path.startsWith(`${directory}${PATH_SEGMENT_SEPARATOR}`)
      )
    );
  const uncoveredExplicitFileTargets = explicitFileTargets.filter((path) =>
    !scopedFilePatternsForDirectoryTargets.some((pattern) => pathMatchesTypeScriptPattern(path, pattern))
  );
  return {
    ...scopeConfig,
    directories: retainedDirectories,
    filePatterns: [
      ...new Set([
        ...scopedFilePatternsForDirectoryTargets,
        ...retainedDirectoryFilePatterns,
        ...retainedDirectoryPatterns,
        ...retainedDirectoryScopePatterns,
        ...retainedDirectoryOperandPatterns,
        ...uncoveredExplicitFileTargets,
      ]),
    ],
  };
}

function typeScriptLiteralDirectoryPattern(pattern: string): string {
  return pattern === TYPESCRIPT_SCOPE_PROJECT_ROOT
    ? TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX.slice(1)
    : `${pattern}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`;
}

export function resolveTypeScriptValidationScope(
  filter: TypeScriptValidationScopeFilter,
  deps: ScopeDeps = defaultScopeDeps,
): ScopeConfig {
  const baseScopeConfig = getTypeScriptScope(filter.scope, filter.productDir, deps);
  const scopeConfig = applyValidationPathFilterToScope(baseScopeConfig, filter.validationPathFilter);
  const explicitTargets = filterExplicitTypeScriptScopeTargets({
    paths: filter.paths,
    productDir: filter.productDir,
    validationPathFilter: filter.validationPathFilter,
    scopeConfig: baseScopeConfig,
    bypassValidationPathFilter: true,
  }, deps);

  if (filter.paths !== undefined && filter.paths.length > 0 && explicitTargets?.length === 0) {
    return {
      ...scopeConfig,
      directories: [],
      filePatterns: [],
      explicitPathNoMatches: true,
      filteredByValidationPaths: undefined,
      filteredByValidationPathIncludes: undefined,
      filteredByValidationPathNoMatches: undefined,
    };
  }

  if (explicitTargets !== undefined && explicitTargets.length > 0) {
    const explicitScopeConfig = constrainTypeScriptScopeToExplicitTargets(baseScopeConfig, explicitTargets);
    return filter.markExplicitPathsAsValidationFilter === true
      ? {
        ...explicitScopeConfig,
        filteredByValidationPaths: true,
        filteredByValidationPathIncludes: true,
        filteredByValidationPathNoMatches: false,
      }
      : explicitScopeConfig;
  }

  return scopeConfig;
}

function constrainTypeScriptPatternToDirectory(pattern: string, directory: string): string {
  const normalizedPattern = normalizeTypeScriptScopePath(pattern);
  const normalizedDirectory = normalizeTypeScriptScopePath(directory);
  if (
    normalizedPattern === normalizedDirectory
    || normalizedPattern.startsWith(`${normalizedDirectory}${PATH_SEGMENT_SEPARATOR}`)
  ) {
    return normalizedPattern;
  }
  const patternSegments = splitTypeScriptScopePathSegments(normalizedPattern);
  const directorySegments = splitTypeScriptScopePathSegments(normalizedDirectory);
  const directoryAdvance = advanceTypeScriptPatternPastDirectory(patternSegments, directorySegments);
  let { patternIndex } = directoryAdvance;
  while (patternSegments[patternIndex] === RECURSIVE_GLOB_SEGMENT) {
    patternIndex += 1;
  }
  const suffixSegments = patternSegments.slice(patternIndex);
  const constrainedSuffixSegments = directoryAdvance.recursiveGlobConsumedDirectory && suffixSegments.length > 0
    ? [RECURSIVE_GLOB_SEGMENT, ...suffixSegments]
    : suffixSegments;
  if (constrainedSuffixSegments.length > 0) {
    return [normalizedDirectory, ...constrainedSuffixSegments].join(PATH_SEGMENT_SEPARATOR);
  }
  return typeScriptScopePatternHasGlob(normalizedPattern)
      && typeScriptScopePatternCoversDirectorySourceSet(normalizedPattern, normalizedDirectory)
    ? `${normalizedDirectory}${TYPESCRIPT_SCOPE_DIRECTORY_PATTERN_SUFFIX}`
    : normalizedDirectory;
}

function advanceTypeScriptPatternPastDirectory(
  patternSegments: readonly string[],
  directorySegments: readonly string[],
): PatternDirectoryAdvance {
  let patternIndex = 0;
  let recursiveGlobConsumedDirectory = false;
  for (const directorySegment of directorySegments) {
    const recursiveAdvance = advanceRecursiveGlobForDirectorySegment(patternSegments, patternIndex, directorySegment);
    patternIndex = recursiveAdvance.patternIndex;
    recursiveGlobConsumedDirectory = recursiveGlobConsumedDirectory || recursiveAdvance.recursiveGlobConsumedDirectory;
    if (recursiveAdvance.recursiveGlobConsumedDirectory) {
      continue;
    }
    if (!patternSegmentMatchesDirectorySegment(patternSegments[patternIndex], directorySegment)) {
      break;
    }
    patternIndex += 1;
  }
  return { patternIndex, recursiveGlobConsumedDirectory };
}

function advanceRecursiveGlobForDirectorySegment(
  patternSegments: readonly string[],
  patternIndex: number,
  directorySegment: string,
): PatternDirectoryAdvance {
  if (patternSegments[patternIndex] !== RECURSIVE_GLOB_SEGMENT) {
    return { patternIndex, recursiveGlobConsumedDirectory: false };
  }
  const nextPatternSegment = patternSegments[patternIndex + 1];
  return patternSegmentMatchesDirectorySegment(nextPatternSegment, directorySegment)
    ? { patternIndex: patternIndex + 1, recursiveGlobConsumedDirectory: false }
    : { patternIndex, recursiveGlobConsumedDirectory: true };
}

function patternSegmentMatchesDirectorySegment(patternSegment: string | undefined, directorySegment: string): boolean {
  return patternSegment !== undefined
    && globSegmentMatchesPathSegment(patternSegment, directorySegment);
}
