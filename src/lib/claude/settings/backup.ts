/**
 * Backup management for Claude Code settings files
 */
import fs from "node:fs/promises";

export const SETTINGS_BACKUP_MARKER = ".backup.";

/**
 * Create a timestamped backup of a settings file
 *
 * Backup format: `<original-path>.backup.YYYY-MM-DD-HHmmss`
 *
 * Example: `settings.json.backup.2026-01-08-143022`
 *
 * @param settingsPath - Absolute path to settings file to back up
 * @returns Promise resolving to backup file path
 * @throws Error if source file doesn't exist or backup fails
 *
 * @example
 * ```typescript
 * const backupPath = await createBackup("/Users/example/.claude/settings.json");
 * // Returns: "/Users/example/.claude/settings.json.backup.2026-01-08-143022"
 * ```
 */
export async function createBackup(settingsPath: string): Promise<string> {
  try {
    // Verify source file exists
    await fs.access(settingsPath, fs.constants.R_OK);

    // Generate timestamp: YYYY-MM-DD-HHmmss
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-") + "-" + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    // Build backup path
    const backupPath = `${settingsPath}${SETTINGS_BACKUP_MARKER}${timestamp}`;

    // Copy file to backup location
    await fs.copyFile(settingsPath, backupPath);

    return backupPath;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        throw new Error(`Settings file not found: ${settingsPath}`);
      }
      if (error.message.includes("EACCES")) {
        throw new Error(`Permission denied: ${settingsPath}`);
      }
      throw new Error(`Failed to create backup: ${error.message}`);
    }
    throw error;
  }
}
