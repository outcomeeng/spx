/**
 * Consolidate command implementation
 *
 * Orchestrates the full consolidation pipeline:
 * 1. Discovery - Find all settings.local.json files
 * 2. Parsing - Extract permissions from each file
 * 3. Merging - Combine with subsumption and conflict resolution
 * 4. Backup - Create timestamped backup (if not dry-run)
 * 5. Writing - Atomically write merged settings (if not dry-run)
 * 6. Reporting - Format and return result summary
 */
import { findSettingsFiles } from "@/lib/claude/permissions/discovery";
import { mergePermissions } from "@/lib/claude/permissions/merger";
import { parseAllSettings, parseSettingsFile } from "@/lib/claude/permissions/parser";
import { createBackup } from "@/lib/claude/settings/backup";
import { formatReport } from "@/lib/claude/settings/reporter";
import { writeSettings } from "@/lib/claude/settings/writer";
import os from "os";
import path from "path";

/**
 * Options for consolidate command
 */
export interface ConsolidateOptions {
  /** Root directory to scan for settings files (default: ~/Code) */
  root?: string;
  /** Write changes to global settings file (default: false = preview only) */
  write?: boolean;
  /** Write merged settings to specified file instead of global settings */
  outputFile?: string;
  /** Path to global settings file (for testing; default: ~/.claude/settings.json) */
  globalSettings?: string;
}

/**
 * Execute settings consolidate command
 *
 * Consolidates permissions from project-local settings files into
 * the global Claude Code settings file.
 *
 * Features:
 * - Discovers all `.claude/settings.local.json` files recursively
 * - Applies subsumption to remove narrower permissions
 * - Resolves conflicts (deny wins over allow)
 * - Deduplicates and sorts permissions
 * - Creates backup before modifications
 * - Supports dry-run mode for preview
 *
 * @param options - Command options
 * @returns Formatted report string
 * @throws Error if discovery, parsing, or writing fails
 *
 * @example
 * ```typescript
 * // Normal consolidation
 * const output = await consolidateCommand({ root: "~/Code" });
 * console.log(output);
 *
 * // Dry-run preview
 * const preview = await consolidateCommand({ root: "~/Code", dryRun: true });
 * console.log(preview);
 * ```
 */
export async function consolidateCommand(
  options: ConsolidateOptions = {},
): Promise<string> {
  // Resolve paths
  const root = options.root
    ? path.resolve(options.root.replace(/^~/, os.homedir()))
    : path.join(os.homedir(), "Code");

  const globalSettingsPath = options.globalSettings
    || path.join(os.homedir(), ".claude", "settings.json");

  const shouldWrite = options.write || false;
  const outputFile = options.outputFile;
  const previewOnly = !shouldWrite && !outputFile;

  // Step 1: Discovery - find all settings.local.json files
  const settingsFiles = await findSettingsFiles(root);

  if (settingsFiles.length === 0) {
    return `No settings files found in ${root}\n\nSearched for: **/.claude/settings.local.json`;
  }

  // Step 2: Parsing - extract permissions from each file
  const localPermissions = await parseAllSettings(settingsFiles);

  // Step 3: Read global settings
  let globalSettings = await parseSettingsFile(globalSettingsPath);

  // If global settings doesn't exist, create empty structure
  if (!globalSettings) {
    globalSettings = {
      permissions: {
        allow: [],
        deny: [],
        ask: [],
      },
    };
  }

  // Ensure permissions object exists
  if (!globalSettings.permissions) {
    globalSettings.permissions = {
      allow: [],
      deny: [],
      ask: [],
    };
  }

  // Step 4: Merge with subsumption and conflict resolution
  const { merged, result } = mergePermissions(
    globalSettings.permissions,
    localPermissions,
  );

  // Step 5: Backup (only when writing to global settings)
  if (shouldWrite) {
    try {
      result.backupPath = await createBackup(globalSettingsPath);
    } catch (error) {
      // If backup fails because file doesn't exist, that's okay (first time)
      if (error instanceof Error && !error.message.includes("not found")) {
        throw error;
      }
    }
  }

  // Step 6: Write (if --write or --output-file specified)
  if (shouldWrite) {
    const updatedSettings = {
      ...globalSettings,
      permissions: merged,
    };
    await writeSettings(globalSettingsPath, updatedSettings);
  } else if (outputFile) {
    const updatedSettings = {
      ...globalSettings,
      permissions: merged,
    };
    const resolvedOutputPath = path.resolve(outputFile.replace(/^~/, os.homedir()));
    await writeSettings(resolvedOutputPath, updatedSettings);
    result.outputPath = resolvedOutputPath;
  }

  // Step 7: Report
  return formatReport(result, previewOnly, globalSettingsPath, outputFile);
}
