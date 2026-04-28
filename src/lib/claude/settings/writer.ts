/**
 * Atomic file writing for Claude Code settings
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { ClaudeSettings } from "../permissions/types";

/**
 * Filesystem abstraction for dependency injection
 *
 * Enables testing error paths without mocking.
 */
export interface FileSystem {
  writeFile(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
}

/**
 * Production filesystem implementation
 */
const realFs: FileSystem = {
  writeFile: (path, content) => fs.writeFile(path, content, "utf-8"),
  rename: fs.rename,
  unlink: fs.unlink,
  mkdir: async (path, options) => {
    await fs.mkdir(path, options);
  },
};

/**
 * Atomically write settings to a file
 *
 * Uses temp file + rename pattern for atomicity:
 * 1. Write to temporary file
 * 2. Rename to target (atomic operation on most filesystems)
 *
 * Preserves JSON formatting with 2-space indentation.
 *
 * @param filePath - Absolute path to settings file
 * @param settings - Settings object to write
 * @param deps - Dependencies (for testing)
 * @throws Error if write fails
 *
 * @example
 * ```typescript
 * const settings = {
 *   permissions: {
 *     allow: ["Bash(git:*)", "Bash(npm:*)"]
 *   }
 * };
 * await writeSettings("/Users/shz/.claude/settings.json", settings);
 * ```
 */
export async function writeSettings(
  filePath: string,
  settings: ClaudeSettings,
  deps: { fs: FileSystem } = { fs: realFs },
): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await deps.fs.mkdir(dir, { recursive: true });

  // Generate temporary file path
  const tempPath = path.join(
    os.tmpdir(),
    `settings-${Date.now()}-${Math.random().toString(36).substring(7)}.json`,
  );

  try {
    // Format JSON with 2-space indentation and trailing newline
    const content = JSON.stringify(settings, null, 2) + "\n";

    // Write to temp file
    await deps.fs.writeFile(tempPath, content);

    // Atomic rename
    await deps.fs.rename(tempPath, filePath);
  } catch (error) {
    // Cleanup temp file on failure
    try {
      await deps.fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    // Re-throw original error
    if (error instanceof Error) {
      throw new Error(`Failed to write settings: ${error.message}`);
    }
    throw error;
  }
}
