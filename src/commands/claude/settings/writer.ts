/**
 * Atomic file writing for Claude Code settings
 */
import { randomBytes as nodeRandomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { type AtomicWriteFileSystem, type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";

import type { ClaudeSettings } from "@/domains/claude/settings/types";

/**
 * Filesystem abstraction for dependency injection
 *
 * Enables testing error paths without mocking.
 */
export interface FileSystem extends AtomicWriteFileSystem {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
}

/**
 * Production filesystem implementation
 */
const realFs: FileSystem = {
  writeFile: (path, content) => fs.writeFile(path, content, "utf-8"),
  rename: fs.rename,
  rm: (path, options) => fs.rm(path, options),
  mkdir: async (path, options) => {
    await fs.mkdir(path, options);
  },
};

const defaultWriteSettingsDeps: { readonly fs: FileSystem } = { fs: realFs };

/**
 * Atomically write settings to a file
 *
 * Routes through the shared atomic file-write primitive: the content is written
 * to a uniquely named temporary sibling of the target and renamed onto it, so a
 * concurrent reader never observes a partial write. Preserves JSON formatting
 * with 2-space indentation.
 *
 * @param filePath - Absolute path to settings file
 * @param settings - Settings object to write
 * @param deps - Dependencies (for testing); `randomBytes` defaults to `node:crypto`
 * @throws Error if write fails
 *
 * @example
 * ```typescript
 * const settings = {
 *   permissions: {
 *     allow: ["Bash(git:*)", "Bash(npm:*)"]
 *   }
 * };
 * await writeSettings("/Users/example/.claude/settings.json", settings);
 * ```
 */
export async function writeSettings(
  filePath: string,
  settings: ClaudeSettings,
  deps: { fs: FileSystem; randomBytes?: RandomBytes } = defaultWriteSettingsDeps,
): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await deps.fs.mkdir(dir, { recursive: true });

  // Format JSON with 2-space indentation and trailing newline
  const content = JSON.stringify(settings, null, 2) + "\n";

  try {
    await writeFileAtomic(filePath, content, {
      fs: deps.fs,
      randomBytes: deps.randomBytes ?? nodeRandomBytes,
    });
  } catch (error) {
    // Re-throw with settings-write context, preserving the original cause
    if (error instanceof Error) {
      throw new Error(`Failed to write settings: ${error.message}`, { cause: error });
    }
    throw error;
  }
}
