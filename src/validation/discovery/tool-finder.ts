/**
 * Tool discovery for validation infrastructure.
 *
 * Discovers validation tools (eslint, tsc, dependency-cruiser, etc.) using a
 * three-tier priority system: bundled → project → global.
 *
 * @module validation/discovery/tool-finder
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { findExecutableOnPath } from "@/lib/executable-on-path";

import { TOOL_DISCOVERY, type ToolSource } from "./constants";

/**
 * Information about a found tool.
 */
export interface ToolLocation {
  /** The tool name */
  tool: string;
  /** Absolute path to the tool executable or package */
  path: string;
  /** Where the tool was found */
  source: ToolSource;
}

/**
 * Information about a tool that was not found.
 */
export interface ToolNotFound {
  /** The tool name that was searched for */
  tool: string;
  /** Human-readable reason why the tool was not found */
  reason: string;
}

/**
 * Result of tool discovery - either found with location or not found with reason.
 */
export type ToolDiscoveryResult =
  | { found: true; location: ToolLocation }
  | { found: false; notFound: ToolNotFound };

/**
 * Dependencies for tool discovery.
 * Enables testing without mocking by accepting controlled implementations.
 */
export interface ToolDiscoveryDeps {
  /**
   * Resolve a module path, returns the resolved path or null if not found.
   * @param modulePath - The module path to resolve (e.g., "eslint/package.json")
   */
  resolveModule: (modulePath: string) => string | null;

  /**
   * Resolve an ESM import specifier, returns the resolved path or null if not found.
   * @param modulePath - The module path to resolve (e.g., "dependency-cruiser")
   */
  resolveImport?: (modulePath: string) => string | null;

  /**
   * Check if a file exists at the given path.
   * @param filePath - The path to check
   */
  existsSync: (filePath: string) => boolean;

  /**
   * Find an executable in the system PATH.
   * @param tool - The tool name to find
   * @returns The absolute path to the tool, or null if not found
   */
  whichSync: (tool: string) => string | null;
}

/**
 * Create a require function for resolving modules.
 * Uses import.meta.url to create a require that resolves from this package.
 */
const require = createRequire(import.meta.url);
const FILE_URL_PROTOCOL = new URL(import.meta.url).protocol;
const PACKAGE_MANIFEST_FILENAME = "package.json";

/**
 * Default production dependencies for tool discovery.
 */
export const defaultToolDiscoveryDeps: ToolDiscoveryDeps = {
  resolveModule: (modulePath: string): string | null => {
    try {
      return require.resolve(modulePath);
    } catch {
      return null;
    }
  },

  resolveImport: (modulePath: string): string | null => {
    try {
      return import.meta.resolve(modulePath);
    } catch {
      return null;
    }
  },

  existsSync: fs.existsSync,

  whichSync: findExecutableOnPath,
};

function resolvedModulePath(resolvedPath: string): string {
  try {
    const resolvedUrl = new URL(resolvedPath);
    return resolvedUrl.protocol === FILE_URL_PROTOCOL ? fileURLToPath(resolvedUrl) : resolvedPath;
  } catch {
    return resolvedPath;
  }
}

function nearestPackageRoot(filePath: string, existsSync: (path: string) => boolean): string | null {
  let currentDirectory = path.dirname(filePath);
  for (;;) {
    if (existsSync(path.join(currentDirectory, PACKAGE_MANIFEST_FILENAME))) {
      return currentDirectory;
    }
    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }
    currentDirectory = parentDirectory;
  }
}

function bundledToolPath(resolvedPath: string, existsSync: (path: string) => boolean): string {
  const bundledFilePath = resolvedModulePath(resolvedPath);
  return nearestPackageRoot(bundledFilePath, existsSync) ?? path.dirname(bundledFilePath);
}

/**
 * Options for tool discovery.
 */
export interface DiscoverToolOptions {
  /**
   * Project root directory for checking project-local node_modules.
   * Defaults to current working directory.
   */
  projectRoot?: string;

  /**
   * Dependencies for tool discovery.
   * Defaults to production dependencies.
   */
  deps?: ToolDiscoveryDeps;
}

/**
 * Discover a validation tool using three-tier priority.
 *
 * Discovery order:
 * 1. **Bundled**: Check if the tool is bundled with spx-cli via require.resolve
 * 2. **Project**: Check project's node_modules/.bin directory
 * 3. **Global**: Check system PATH via `which` command
 *
 * @param tool - The tool name to discover (e.g., "eslint", "typescript", "dependency-cruiser")
 * @param options - Discovery options including projectRoot and dependencies
 * @returns Discovery result with found location or not found reason
 *
 * @example
 * ```typescript
 * const result = await discoverTool("eslint");
 * if (result.found) {
 *   console.log(`Found ${result.location.tool} at ${result.location.path}`);
 *   console.log(`Source: ${result.location.source}`);
 * } else {
 *   console.log(`Not found: ${result.notFound.reason}`);
 * }
 * ```
 */
export async function discoverTool(
  tool: string,
  options: DiscoverToolOptions = {},
): Promise<ToolDiscoveryResult> {
  const { projectRoot = CONFIG_PROCESS_CWD.read(), deps = defaultToolDiscoveryDeps } = options;

  // Tier 1: Check if bundled with spx-cli
  const bundledPath = deps.resolveModule(`${tool}/package.json`) ?? deps.resolveImport?.(tool);
  if (bundledPath) {
    return {
      found: true,
      location: {
        tool,
        path: bundledToolPath(bundledPath, deps.existsSync),
        source: TOOL_DISCOVERY.SOURCES.BUNDLED,
      },
    };
  }

  // Tier 2: Check project's node_modules/.bin
  const projectBinPath = path.join(projectRoot, "node_modules", ".bin", tool);
  if (deps.existsSync(projectBinPath)) {
    return {
      found: true,
      location: {
        tool,
        path: projectBinPath,
        source: TOOL_DISCOVERY.SOURCES.PROJECT,
      },
    };
  }

  // Tier 3: Check system PATH
  const globalPath = deps.whichSync(tool);
  if (globalPath) {
    return {
      found: true,
      location: {
        tool,
        path: globalPath,
        source: TOOL_DISCOVERY.SOURCES.GLOBAL,
      },
    };
  }

  // Not found anywhere
  return {
    found: false,
    notFound: {
      tool,
      reason: TOOL_DISCOVERY.MESSAGES.NOT_FOUND_REASON(tool),
    },
  };
}

/**
 * Format a graceful skip message for when a tool is not found.
 *
 * @param stepName - The name of the validation step being skipped
 * @param result - The tool discovery result
 * @returns Formatted skip message, or empty string if tool was found
 *
 * @example
 * ```typescript
 * const result = await discoverTool("dependency-cruiser");
 * const message = formatSkipMessage("Circular dependency check", result);
 * // "⏭ Skipping Circular dependency check (dependency-cruiser not available)"
 * ```
 */
export function formatSkipMessage(
  stepName: string,
  result: ToolDiscoveryResult,
): string {
  if (result.found) {
    return "";
  }
  return TOOL_DISCOVERY.MESSAGES.SKIP_FORMAT(stepName, result.notFound.tool);
}
