/**
 * Formatting and reporting of consolidation results
 */
import { CLAUDE_LOCAL_SETTINGS_GLOB } from "./files";
import { type ConsolidationResult, PERMISSION_CATEGORY, type PermissionCategory } from "./types";

export interface ConsolidationReportUsage {
  readonly writeGlobalSettings: string;
  readonly writeOutputFile: string;
}

export const CONSOLIDATION_REPORT_TEXT = {
  NO_SETTINGS_FILES: "No settings files found",
  PREVIEW_MODE: "Preview mode: No changes written",
  BACKUP_CREATED: "Backup created:",
  SETTINGS_WRITTEN: "Settings written to:",
  GLOBAL_SETTINGS_UPDATED: "Global settings updated:",
} as const;

export function formatNoSettingsReport(root: string): string {
  return `${CONSOLIDATION_REPORT_TEXT.NO_SETTINGS_FILES} in ${root}\n\nSearched for: ${CLAUDE_LOCAL_SETTINGS_GLOB}`;
}

/**
 * Format consolidation result as user-friendly text report
 *
 * Shows:
 * - Files scanned/processed/skipped
 * - Permissions added by category (allow/deny/ask)
 * - Conflicts resolved
 * - Subsumed permissions removed
 * - Backup path (if created)
 * - Instructions (if preview mode) or confirmation (if written)
 *
 * @param result - Consolidation result data
 * @param previewOnly - Whether this is preview-only mode (default behavior)
 * @param globalSettingsPath - Path to global settings file
 * @param outputFile - Optional output file path
 * @param usage - Caller-owned command usage rendered in next-step instructions
 * @returns Formatted report string
 *
 * @example
 * ```typescript
 * const result = {
 *   filesScanned: 12,
 *   filesProcessed: 10,
 *   filesSkipped: 2,
 *   added: {
 *     allow: ["Bash(git:*)", "Bash(npm:*)"],
 *     deny: ["Bash(rm:*)"],
 *     ask: []
 *   },
 *   subsumed: ["Bash(git log:*)", "Bash(git worktree:*)"],
 *   conflictsResolved: 1,
 *   backupPath: "/Users/example/.claude/settings.json.backup.2026-01-08-143022"
 * };
 *
 * console.log(formatReport(result, true, "/Users/example/.claude/settings.json"));
 * // Outputs formatted report with instructions
 * ```
 */
export function formatReport(
  result: ConsolidationResult,
  previewOnly: boolean,
  globalSettingsPath: string,
  outputFile?: string,
  usage?: ConsolidationReportUsage,
): string {
  const totalAdded = result.added.allow.length
    + result.added.deny.length
    + result.added.ask.length;
  return [
    ...headerLines(),
    ...filesSummaryLines(result),
    ...permissionLines(result, totalAdded),
    ...subsumptionLines(result),
    ...conflictLines(result),
    ...backupLines(result),
    ...summaryLines(result),
    ...finalStatusLines(result, previewOnly, globalSettingsPath, outputFile, usage),
  ].join("\n");
}

function headerLines(): string[] {
  return ["Scanning for Claude Code settings files...", ""];
}

function filesSummaryLines(result: ConsolidationResult): string[] {
  const lines = [`Found ${result.filesScanned} settings files`, `  Processed: ${result.filesProcessed}`];
  if (result.filesSkipped > 0) lines.push(`  Skipped: ${result.filesSkipped} (no permissions)`);
  return [...lines, ""];
}

function permissionLines(result: ConsolidationResult, totalAdded: number): string[] {
  if (totalAdded === 0) return ["No new permissions to add (all permissions already in global settings)", ""];
  return [
    `Permissions to add: ${totalAdded}`,
    ...permissionCategoryLines(PERMISSION_CATEGORY.ALLOW, result.added.allow),
    ...permissionCategoryLines(PERMISSION_CATEGORY.DENY, result.added.deny),
    ...permissionCategoryLines(PERMISSION_CATEGORY.ASK, result.added.ask),
    "",
  ];
}

function permissionCategoryLines(label: PermissionCategory, permissions: readonly string[]): string[] {
  if (permissions.length === 0) return [];
  return ["", `  ${label}:`, ...permissions.map((permission) => `    + ${permission}`)];
}

function subsumptionLines(result: ConsolidationResult): string[] {
  if (result.subsumed.length === 0) return [];
  return [
    `Subsumed permissions removed: ${result.subsumed.length}`,
    "  (narrower permissions replaced by broader ones)",
    ...result.subsumed.map((permission) => `    - ${permission}`),
    "",
  ];
}

function conflictLines(result: ConsolidationResult): string[] {
  if (result.conflictsResolved === 0) return [];
  return [`Conflicts resolved: ${result.conflictsResolved}`, "  (permissions moved from allow to deny)", ""];
}

function backupLines(result: ConsolidationResult): string[] {
  return result.backupPath
    ? [`${CONSOLIDATION_REPORT_TEXT.BACKUP_CREATED} ${result.backupPath}`, ""]
    : [];
}

function summaryLines(result: ConsolidationResult): string[] {
  return [
    "Summary:",
    `  Files scanned: ${result.filesScanned}`,
    `  Permissions added: ${result.added.allow.length} allow, ${result.added.deny.length} deny, ${result.added.ask.length} ask`,
    ...optionalSummaryLines(result),
    "",
  ];
}

function optionalSummaryLines(result: ConsolidationResult): string[] {
  return [
    ...(result.subsumed.length > 0 ? [`  Subsumed removed: ${result.subsumed.length}`] : []),
    ...(result.conflictsResolved > 0 ? [`  Conflicts resolved: ${result.conflictsResolved}`] : []),
  ];
}

function finalStatusLines(
  result: ConsolidationResult,
  previewOnly: boolean,
  globalSettingsPath: string,
  outputFile?: string,
  usage?: ConsolidationReportUsage,
): string[] {
  if (previewOnly) {
    return [
      `ℹ️  ${CONSOLIDATION_REPORT_TEXT.PREVIEW_MODE}`,
      ...(usage === undefined
        ? []
        : [
          "",
          "To apply changes:",
          `  • Modify global settings: ${usage.writeGlobalSettings}`,
          `  • Write to file: ${usage.writeOutputFile}`,
        ]),
    ];
  }
  if (outputFile) {
    return [
      `✓ ${CONSOLIDATION_REPORT_TEXT.SETTINGS_WRITTEN} ${result.outputPath || outputFile}`,
      "",
      "To apply to your global settings:",
      `  • Review the file, then copy to: ${globalSettingsPath}`,
      ...(usage === undefined ? [] : [`  • Or run: ${usage.writeGlobalSettings}`]),
    ];
  }
  return [
    `✓ ${CONSOLIDATION_REPORT_TEXT.GLOBAL_SETTINGS_UPDATED} ${globalSettingsPath}`,
  ];
}
