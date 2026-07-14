/**
 * Backup management for Claude Code settings files
 */
import { CLAUDE_SETTINGS_PATH } from "@/domains/claude/settings/files";
import fs from "node:fs/promises";

/**
 * Create a timestamped backup of a settings file
 *
 * Backup format: `<original-path>.backup.YYYY-MM-DD-HHmmss`
 *
 * Example: `settings.json.backup.2026-01-08-143022`
 *
 * @param settingsPath - Absolute path to settings file to back up
 * @param now - Caller-owned clock used to generate the backup timestamp
 * @returns Promise resolving to backup file path
 * @throws Error if source file doesn't exist or backup fails
 */
export async function createBackup(
  settingsPath: string,
  now: () => Date,
): Promise<string> {
  try {
    // Verify source file exists
    await fs.access(settingsPath, fs.constants.R_OK);

    // Generate timestamp: YYYY-MM-DD-HHmmss
    const timestampSource = now();
    const timestamp = [
      timestampSource.getFullYear(),
      String(timestampSource.getMonth() + 1).padStart(2, "0"),
      String(timestampSource.getDate()).padStart(2, "0"),
    ].join("-") + "-" + [
      String(timestampSource.getHours()).padStart(2, "0"),
      String(timestampSource.getMinutes()).padStart(2, "0"),
      String(timestampSource.getSeconds()).padStart(2, "0"),
    ].join("");

    // Build backup path
    const backupPath = `${settingsPath}${CLAUDE_SETTINGS_PATH.BACKUP_MARKER}${timestamp}`;

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
