/**
 * Formatting and reporting of consolidation results
 */
import type { ConsolidationResult } from "../permissions/types";

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
 *   backupPath: "/Users/shz/.claude/settings.json.backup.2026-01-08-143022"
 * };
 *
 * console.log(formatReport(result, true, "/Users/shz/.claude/settings.json"));
 * // Outputs formatted report with instructions
 * ```
 */
export function formatReport(
  result: ConsolidationResult,
  previewOnly: boolean,
  globalSettingsPath?: string,
  outputFile?: string,
): string {
  const lines: string[] = [];

  // Header
  lines.push("Scanning for Claude Code settings files...");
  lines.push("");

  // Files summary
  lines.push(`Found ${result.filesScanned} settings files`);
  lines.push(`  Processed: ${result.filesProcessed}`);
  if (result.filesSkipped > 0) {
    lines.push(`  Skipped: ${result.filesSkipped} (no permissions)`);
  }
  lines.push("");

  // Permissions added
  const totalAdded = result.added.allow.length
    + result.added.deny.length
    + result.added.ask.length;

  if (totalAdded > 0) {
    lines.push(`Permissions to add: ${totalAdded}`);

    if (result.added.allow.length > 0) {
      lines.push("");
      lines.push("  allow:");
      for (const perm of result.added.allow) {
        lines.push(`    + ${perm}`);
      }
    }

    if (result.added.deny.length > 0) {
      lines.push("");
      lines.push("  deny:");
      for (const perm of result.added.deny) {
        lines.push(`    + ${perm}`);
      }
    }

    if (result.added.ask.length > 0) {
      lines.push("");
      lines.push("  ask:");
      for (const perm of result.added.ask) {
        lines.push(`    + ${perm}`);
      }
    }
  } else {
    lines.push("No new permissions to add (all permissions already in global settings)");
  }

  lines.push("");

  // Subsumption results
  if (result.subsumed.length > 0) {
    lines.push(`Subsumed permissions removed: ${result.subsumed.length}`);
    lines.push("  (narrower permissions replaced by broader ones)");
    for (const perm of result.subsumed) {
      lines.push(`    - ${perm}`);
    }
    lines.push("");
  }

  // Conflicts
  if (result.conflictsResolved > 0) {
    lines.push(`Conflicts resolved: ${result.conflictsResolved}`);
    lines.push("  (permissions moved from allow to deny)");
    lines.push("");
  }

  // Backup
  if (result.backupPath) {
    lines.push(`Backup created: ${result.backupPath}`);
    lines.push("");
  }

  // Summary
  lines.push("Summary:");
  lines.push(`  Files scanned: ${result.filesScanned}`);
  lines.push(
    `  Permissions added: ${result.added.allow.length} allow, ${result.added.deny.length} deny, ${result.added.ask.length} ask`,
  );
  if (result.subsumed.length > 0) {
    lines.push(`  Subsumed removed: ${result.subsumed.length}`);
  }
  if (result.conflictsResolved > 0) {
    lines.push(`  Conflicts resolved: ${result.conflictsResolved}`);
  }

  // Final status message
  lines.push("");
  if (previewOnly) {
    lines.push("ℹ️  Preview mode: No changes written");
    lines.push("");
    lines.push("To apply changes:");
    lines.push(`  • Modify global settings: spx claude settings consolidate --write`);
    lines.push(`  • Write to file: spx claude settings consolidate --output-file /path/to/file`);
  } else if (outputFile) {
    lines.push(`✓ Settings written to: ${result.outputPath || outputFile}`);
    lines.push("");
    lines.push("To apply to your global settings:");
    lines.push(`  • Review the file, then copy to: ${globalSettingsPath || "~/.claude/settings.json"}`);
    lines.push(`  • Or run: spx claude settings consolidate --write`);
  } else {
    lines.push(`✓ Global settings updated: ${globalSettingsPath || "~/.claude/settings.json"}`);
  }

  return lines.join("\n");
}
