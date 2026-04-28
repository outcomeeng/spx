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
import { join } from "node:path";

import type { ScopeConfig, ValidationScope } from "../types";

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
  extends?: string;
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
      include: ["**/*.ts", "**/*.tsx"],
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
  deps: ScopeDeps = defaultScopeDeps,
): TypeScriptConfig {
  const configFile = TSCONFIG_FILES[scope];
  const config = parseTypeScriptConfig(configFile, deps);

  if (config.extends) {
    const baseConfig = parseTypeScriptConfig(config.extends, deps);
    return {
      include: config.include ?? baseConfig.include ?? [],
      exclude: [...(baseConfig.exclude ?? []), ...(config.exclude ?? [])],
    };
  }

  return {
    include: config.include ?? [],
    exclude: config.exclude ?? [],
  };
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
      (item) => item.isFile() && (item.name.endsWith(".ts") || item.name.endsWith(".tsx")),
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
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  const allTopLevelItems = deps.readdirSync(".", { withFileTypes: true });
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
      // Check if directory has TypeScript files
      try {
        const hasTypeScriptFiles = hasTypeScriptFilesRecursive(dir, 2, deps);
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
 * Get validation directories based on tsconfig files.
 *
 * @param scope - Validation scope
 * @param deps - Injectable dependencies
 * @returns Array of directory names to validate
 */
export function getValidationDirectories(
  scope: ValidationScope,
  deps: ScopeDeps = defaultScopeDeps,
): string[] {
  // Get TypeScript configuration for the specified mode
  const config = resolveTypeScriptConfig(scope, deps);

  // Get directories that contain TypeScript files and respect tsconfig exclude patterns
  const configDirectories = getTopLevelDirectoriesWithTypeScript(config, deps);

  // Only include directories that actually exist
  const existingDirectories = configDirectories.filter((dir) => deps.existsSync(dir));

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
 * const scopeConfig = getTypeScriptScope("full");
 * console.log(scopeConfig.directories); // ["src", "tests", "scripts"]
 * ```
 */
export function getTypeScriptScope(
  scope: ValidationScope,
  deps: ScopeDeps = defaultScopeDeps,
): ScopeConfig {
  // Use validation-focused directory selection
  const directories = getValidationDirectories(scope, deps);

  // Read TypeScript config for patterns
  const config = resolveTypeScriptConfig(scope, deps);

  return {
    directories,
    filePatterns: config.include ?? [],
    excludePatterns: config.exclude ?? [],
  };
}
