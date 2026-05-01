/**
 * Directory walking and filesystem traversal
 */
import fs from "fs/promises";
import path from "path";
import type { DirectoryEntry, WorkItem } from "../types";
import { parseWorkItemName } from "./patterns";

/**
 * Recursively walk a directory tree and return all subdirectories
 *
 * @param root - Root directory path to start walking from
 * @param visited - Set of visited paths to avoid symlink loops (internal use)
 * @returns Promise resolving to array of directory entries
 * @throws Error if root directory doesn't exist or permission denied
 *
 * @example
 * ```typescript
 * const entries = await walkDirectory("/path/to/specs");
 * // Returns: [{ name: "capability-21_test", path: "/path/to/specs/capability-21_test", isDirectory: true }, ...]
 * ```
 */
export async function walkDirectory(
  root: string,
  visited: Set<string> = new Set(),
): Promise<DirectoryEntry[]> {
  // Normalize and resolve path to handle symlinks
  const normalizedRoot = path.resolve(root);

  // Check for symlink loops
  if (visited.has(normalizedRoot)) {
    return []; // Skip already visited directories
  }
  visited.add(normalizedRoot);

  try {
    // Read directory contents
    const entries = await fs.readdir(normalizedRoot, { withFileTypes: true });
    const results: DirectoryEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(normalizedRoot, entry.name);

      // Only process directories
      if (entry.isDirectory()) {
        // Add current directory
        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true,
        });

        // Recursively walk subdirectories
        const subEntries = await walkDirectory(fullPath, visited);
        results.push(...subEntries);
      }
    }

    return results;
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(
        `Failed to walk directory "${normalizedRoot}": ${error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Filter directory entries to include only work item directories
 *
 * Uses parseWorkItemName() to validate directory names match work item patterns.
 * Excludes directories that don't match capability/feature/story patterns.
 *
 * @param entries - Array of directory entries to filter
 * @returns Filtered array containing only valid work item directories
 *
 * @example
 * ```typescript
 * const entries = [
 *   { name: "capability-21_test", path: "/specs/capability-21_test", isDirectory: true },
 *   { name: "node_modules", path: "/specs/node_modules", isDirectory: true },
 * ];
 * const filtered = filterWorkItemDirectories(entries);
 * // Returns: [{ name: "capability-21_test", ... }]
 * ```
 */
export function filterWorkItemDirectories(
  entries: DirectoryEntry[],
): DirectoryEntry[] {
  return entries.filter((entry) => {
    try {
      // Try to parse the directory name as a work item
      parseWorkItemName(entry.name);
      return true; // Valid work item pattern
    } catch {
      return false; // Not a work item pattern
    }
  });
}

/**
 * Convert directory entries to WorkItem objects
 *
 * Parses each directory entry name to extract work item metadata (kind, number, slug)
 * and combines it with the full filesystem path.
 *
 * @param entries - Filtered directory entries (work items only)
 * @returns Array of WorkItem objects with full metadata
 * @throws Error if any entry has invalid work item pattern
 *
 * @example
 * ```typescript
 * const entries = [
 *   { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli", isDirectory: true },
 * ];
 * const workItems = buildWorkItemList(entries);
 * // Returns: [{ kind: "capability", number: 20, slug: "core-cli", path: "/specs/capability-21_core-cli" }]
 * ```
 */
export function buildWorkItemList(entries: DirectoryEntry[]): WorkItem[] {
  return entries.map((entry) => ({
    ...parseWorkItemName(entry.name),
    path: entry.path,
  }));
}

/**
 * Normalize path separators for cross-platform consistency
 *
 * Converts Windows backslashes to forward slashes for consistent path handling
 * across different operating systems.
 *
 * @param filepath - Path to normalize
 * @returns Normalized path with forward slashes
 *
 * @example
 * ```typescript
 * normalizePath("C:\\Users\\test\\specs"); // Returns: "C:/Users/test/specs"
 * normalizePath("/home/user/specs");      // Returns: "/home/user/specs"
 * ```
 */
export function normalizePath(filepath: string): string {
  // Replace all backslashes with forward slashes for cross-platform consistency
  return filepath.replace(/\\/g, "/");
}
