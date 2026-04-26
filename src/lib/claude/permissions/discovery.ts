/**
 * Discovery of Claude Code settings files across project directories
 */
import fs from "fs/promises";
import path from "path";

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
 *
 * @example
 * ```typescript
 * const files = await findSettingsFiles("~/Code");
 * // Returns: [
 * //   "/Users/user/Code/project-a/.claude/settings.local.json",
 * //   "/Users/user/Code/project-b/.claude/settings.local.json"
 * // ]
 * ```
 */
export async function findSettingsFiles(
  root: string,
  visited: Set<string> = new Set(),
): Promise<string[]> {
  // Normalize and resolve path to handle symlinks and ~ expansion
  const normalizedRoot = path.resolve(root.replace(/^~/, process.env.HOME || "~"));

  // Check for symlink loops
  if (visited.has(normalizedRoot)) {
    return []; // Skip already visited directories
  }
  visited.add(normalizedRoot);

  try {
    // Stat the root to verify it exists and is a directory
    const stats = await fs.stat(normalizedRoot);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${normalizedRoot}`);
    }

    // Read directory contents
    const entries = await fs.readdir(normalizedRoot, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(normalizedRoot, entry.name);

      // If this is a .claude directory, check for settings.local.json
      if (entry.isDirectory() && entry.name === ".claude") {
        const settingsPath = path.join(fullPath, "settings.local.json");
        if (await isValidSettingsFile(settingsPath)) {
          results.push(settingsPath);
        }
      }

      // Recursively search subdirectories (skip .claude to avoid double-checking)
      if (entry.isDirectory() && entry.name !== ".claude") {
        const subFiles = await findSettingsFiles(fullPath, visited);
        results.push(...subFiles);
      }
    }

    return results;
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        throw new Error(`Directory not found: ${normalizedRoot}`);
      }
      if (error.message.includes("EACCES")) {
        throw new Error(`Permission denied: ${normalizedRoot}`);
      }
      throw new Error(`Failed to search directory "${normalizedRoot}": ${error.message}`);
    }
    throw error;
  }
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
