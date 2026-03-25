/**
 * Session prune CLI command handler.
 *
 * @module commands/session/prune
 */

import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveSessionConfig } from "../../git/root.js";
import { parseSessionMetadata, sortSessions } from "../../session/list.js";
import type { SessionDirectoryConfig } from "../../session/show.js";
import type { Session } from "../../session/types.js";

/**
 * Default number of sessions to keep when pruning.
 */
export const DEFAULT_KEEP_COUNT = 5;

/**
 * Options for the prune command.
 */
export interface PruneOptions {
  /** Number of sessions to keep (default: 5) */
  keep?: number;
  /** Show what would be deleted without actually deleting */
  dryRun?: boolean;
  /** Custom sessions directory */
  sessionsDir?: string;
}

/**
 * Error thrown when prune options are invalid.
 */
export class PruneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PruneValidationError";
  }
}

/**
 * Validates prune options.
 *
 * @param options - Options to validate
 * @throws {PruneValidationError} When options are invalid
 */
export function validatePruneOptions(options: PruneOptions): void {
  if (options.keep !== undefined) {
    if (!Number.isInteger(options.keep) || options.keep < 1) {
      throw new PruneValidationError(
        `Invalid --keep value: ${options.keep}. Must be a positive integer.`,
      );
    }
  }
}

/**
 * Loads sessions from the archive directory.
 */
async function loadArchiveSessions(config: SessionDirectoryConfig): Promise<Session[]> {
  try {
    const files = await readdir(config.archiveDir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const id = file.replace(".md", "");
      const filePath = join(config.archiveDir, file);
      const content = await readFile(filePath, "utf-8");
      const metadata = parseSessionMetadata(content);

      sessions.push({
        id,
        status: "archive",
        path: filePath,
        metadata,
      });
    }

    return sessions;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Determines which sessions to prune.
 *
 * Sessions are sorted by priority (high first) then by timestamp (newest first).
 * The first `keep` sessions are retained, the rest are marked for deletion.
 *
 * @param sessions - All todo sessions
 * @param keep - Number of sessions to keep
 * @returns Sessions to delete (oldest/lowest priority first)
 */
export function selectSessionsToPrune(sessions: Session[], keep: number): Session[] {
  // Sort sessions by priority and timestamp
  const sorted = sortSessions(sessions);

  // Keep the top N sessions, prune the rest
  if (sorted.length <= keep) {
    return [];
  }

  return sorted.slice(keep);
}

/**
 * Executes the prune command.
 *
 * @param options - Command options
 * @returns Formatted output for display
 * @throws {PruneValidationError} When options are invalid
 */
export async function pruneCommand(options: PruneOptions): Promise<string> {
  // Validate options
  validatePruneOptions(options);

  const keep = options.keep ?? DEFAULT_KEEP_COUNT;
  const dryRun = options.dryRun ?? false;

  const { config } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Load and sort sessions
  const sessions = await loadArchiveSessions(config);
  const toPrune = selectSessionsToPrune(sessions, keep);

  if (toPrune.length === 0) {
    return `No sessions to prune. ${sessions.length} sessions kept.`;
  }

  // Dry run mode
  if (dryRun) {
    const lines = [
      `Would delete ${toPrune.length} sessions:`,
      ...toPrune.map((s) => `  - ${s.id}`),
      "",
      `${sessions.length - toPrune.length} sessions would be kept.`,
    ];
    return lines.join("\n");
  }

  // Delete sessions
  for (const session of toPrune) {
    await unlink(session.path);
  }

  const lines = [
    `Deleted ${toPrune.length} sessions:`,
    ...toPrune.map((s) => `  - ${s.id}`),
    "",
    `${sessions.length - toPrune.length} sessions kept.`,
  ];
  return lines.join("\n");
}
