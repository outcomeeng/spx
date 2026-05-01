/**
 * Session prune CLI command handler.
 *
 * @module commands/session/prune
 */

import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { parseSessionMetadata } from "@/domains/session/list";
import { DEFAULT_KEEP_COUNT, selectSessionsToDelete } from "@/domains/session/prune";
import { SessionDirectoryConfig } from "@/domains/session/show";
import { Session, SESSION_STATUSES, SessionStatus } from "@/domains/session/types";
import { resolveSessionConfig } from "@/git/root";

export { DEFAULT_KEEP_COUNT };

/** Prune operates only on archived sessions. */
const PRUNE_STATUS: SessionStatus = SESSION_STATUSES[2]; // archive

export const SESSION_PRUNE_OUTPUT = {
  DELETED: "Deleted",
  WOULD_DELETE: "Would delete",
} as const;

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
        status: PRUNE_STATUS,
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
  const toPrune = selectSessionsToDelete(sessions, { keep });

  if (toPrune.length === 0) {
    return `No sessions to prune. ${sessions.length} sessions kept.`;
  }

  // Dry run mode
  if (dryRun) {
    const lines = [
      `${SESSION_PRUNE_OUTPUT.WOULD_DELETE} ${toPrune.length} sessions:`,
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
    `${SESSION_PRUNE_OUTPUT.DELETED} ${toPrune.length} sessions:`,
    ...toPrune.map((s) => `  - ${s.id}`),
    "",
    `${sessions.length - toPrune.length} sessions kept.`,
  ];
  return lines.join("\n");
}
