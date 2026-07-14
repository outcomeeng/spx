/**
 * Filesystem discovery of Claude Code settings files across product directories.
 */
import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Recursively find all .claude/settings.local.json files under a root directory
 *
 * Walks the directory tree looking for files matching the pattern:
 * `**\/.claude/settings.local.json`
 *
 * @param root - Root directory path to start searching from
 * @param visited - Set of visited paths to avoid symlink loops (internal use)
 * @returns Promise resolving to array of absolute paths to settings.local.json files
 * @throws Error if root directory doesn't exist or permission denied
 */
export async function findSettingsFiles(
  root: string,
  visited: Set<string> = new Set(),
): Promise<string[]> {
  const normalizedRoot = path.resolve(root);

  if (visited.has(normalizedRoot)) {
    return [];
  }
  visited.add(normalizedRoot);

  try {
    return await findSettingsFilesInDirectory(normalizedRoot, visited);
  } catch (error) {
    throw discoveryError(normalizedRoot, error);
  }
}

async function findSettingsFilesInDirectory(
  normalizedRoot: string,
  visited: Set<string>,
): Promise<string[]> {
  const stats = await fs.stat(normalizedRoot);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${normalizedRoot}`);
  }

  const entries = await fs.readdir(normalizedRoot, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    results.push(...await settingsFilesForEntry(normalizedRoot, entry, visited));
  }
  return results;
}

async function settingsFilesForEntry(
  normalizedRoot: string,
  entry: Dirent,
  visited: Set<string>,
): Promise<string[]> {
  if (!entry.isDirectory()) return [];

  const fullPath = path.join(normalizedRoot, entry.name);
  if (entry.name === CLAUDE_SETTINGS_PATH.DIRECTORY) {
    const settingsPath = path.join(fullPath, CLAUDE_SETTINGS_PATH.LOCAL_FILE);
    return await isValidSettingsFile(settingsPath) ? [settingsPath] : [];
  }

  return findSettingsFiles(fullPath, visited);
}

function discoveryError(normalizedRoot: string, error: unknown): Error {
  if (!(error instanceof Error)) return new Error(unknownErrorMessage(error));
  if (error.message.includes("ENOENT")) return new Error(`Directory not found: ${normalizedRoot}`);
  if (error.message.includes("EACCES")) return new Error(`Permission denied: ${normalizedRoot}`);
  return new Error(`Failed to search directory "${normalizedRoot}": ${error.message}`);
}

function unknownErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return error.toString();
  if (typeof error === "symbol") return error.description ?? "Symbol()";
  if (error === undefined) return "undefined";
  return Object.prototype.toString.call(error);
}

/**
 * Check if a given path is a valid settings.local.json file
 *
 * Validates that:
 * - File exists
 * - File is readable
 * - File has .json extension
 *
 * @param filePath - Absolute path to check
 * @returns Promise resolving to true if valid settings file, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await isValidSettingsFile("/path/to/.claude/settings.local.json");
 * // Returns: true or false
 * ```
 */
export async function isValidSettingsFile(filePath: string): Promise<boolean> {
  try {
    // Check if file exists and is readable
    await fs.access(filePath, fs.constants.R_OK);

    // Check if it's actually a file (not a directory)
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // Validate it has .json extension
    return path.extname(filePath) === ".json";
  } catch {
    // File doesn't exist or isn't readable
    return false;
  }
}
