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
import { mergePermissions } from "@/domains/claude/settings/merger";
import {
  type ConsolidationReportUsage,
  formatNoSettingsReport,
  formatReport,
} from "@/domains/claude/settings/reporter";
import { createEmptyClaudeSettings, SETTINGS_FILE_PARSE_STATUS } from "@/domains/claude/settings/types";
import { createBackup } from "./backup";
import { findSettingsFiles } from "./discovery";
import { parseAllSettings, parseSettingsFile } from "./parser";
import { writeSettings } from "./writer";

/**
 * Options for consolidate command
 */
export interface ConsolidateOptions {
  /** Absolute root directory to scan for settings files. */
  root: string;
  /** Write changes to global settings file (default: false = preview only) */
  write?: boolean;
  /** Write merged settings to specified file instead of global settings */
  outputFile?: string;
  /** Absolute path to the global settings file. */
  globalSettings: string;
  /** Invocation-host clock used for backup names. */
  now: () => Date;
  /** Caller-owned command usage for report next-step instructions. */
  usage?: ConsolidationReportUsage;
}

/**
 * Execute settings consolidate command
 *
 * Consolidates permissions from project-local settings files into
 * the global Claude Code settings file.
 *
 * Behavior:
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
 */
export async function consolidateCommand(
  options: ConsolidateOptions,
): Promise<string> {
  const { root, globalSettings: globalSettingsPath } = options;
  const shouldWrite = options.write ?? false;
  const outputFile = options.outputFile;
  const previewOnly = !shouldWrite && !outputFile;

  // Step 1: Discovery - find all settings.local.json files
  const settingsFiles = await findSettingsFiles(root);

  if (settingsFiles.length === 0) {
    return formatNoSettingsReport(root);
  }

  // Step 2: Parsing - extract permissions from each file
  const localSettingsResults = await parseAllSettings(settingsFiles);
  const localPermissions = localSettingsResults.flatMap((parseResult) =>
    parseResult.status === SETTINGS_FILE_PARSE_STATUS.SUCCESS && parseResult.settings.permissions
      ? [parseResult.settings.permissions]
      : []
  );

  // Step 3: Read global settings
  const globalSettingsResult = await parseSettingsFile(globalSettingsPath);
  let globalSettings = globalSettingsResult.status === SETTINGS_FILE_PARSE_STATUS.SUCCESS
    ? globalSettingsResult.settings
    : undefined;

  // If global settings doesn't exist, create empty structure
  if (!globalSettings) {
    globalSettings = createEmptyClaudeSettings();
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
  result.filesScanned = localSettingsResults.length;
  result.filesSkipped += localSettingsResults.length - localPermissions.length;

  // Step 5: Backup (only when writing to global settings)
  if (shouldWrite) {
    try {
      result.backupPath = await createBackup(globalSettingsPath, options.now);
    } catch (error) {
      // If backup fails because file doesn't exist, that's okay (first time)
      if (error instanceof Error && !error.message.includes("not found")) {
        throw error;
      }
    }
  }

  // Step 6: Write when either output mode is selected.
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
    await writeSettings(outputFile, updatedSettings);
    result.outputPath = outputFile;
  }

  // Step 7: Report
  return formatReport(result, previewOnly, globalSettingsPath, outputFile, options.usage);
}
