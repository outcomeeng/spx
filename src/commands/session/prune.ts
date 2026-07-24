/**
 * Session prune CLI command handler.
 *
 * @module commands/session/prune
 */

import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { parseSessionMetadata } from "@/domains/session/list";
import { DEFAULT_KEEP_COUNT as DOMAIN_DEFAULT_KEEP_COUNT, selectSessionsToDelete } from "@/domains/session/prune";
import { SessionDirectoryConfig } from "@/domains/session/show";
import {
  Session,
  SESSION_FILE_ENCODING,
  SESSION_FILE_ERROR_CODE,
  SESSION_STATUSES,
  SessionStatus,
} from "@/domains/session/types";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

export { DEFAULT_KEEP_COUNT } from "@/domains/session/prune";

/** Prune operates only on archived sessions. */
const PRUNE_STATUS: SessionStatus = SESSION_STATUSES[2]; // archive

export const SESSION_PRUNE_OUTPUT = {
  DELETED: "Deleted",
  WOULD_DELETE: "Would delete",
  NOTHING_TO_PRUNE: "No sessions to prune.",
  SESSIONS_SUFFIX: "sessions:",
  SESSIONS_KEPT: "sessions kept.",
  SESSIONS_WOULD_BE_KEPT: "sessions would be kept.",
} as const;

/** The product's own line structure between prune-summary lines. */
const PRUNE_LINE_SEPARATOR = "\n";
/** Leading bullet on each pruned-session line. */
const PRUNE_ITEM_PREFIX = "  - ";

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
  /** Current working directory for default session-store resolution. */
  cwd?: string;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
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
      const content = await readFile(filePath, SESSION_FILE_ENCODING);
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
    if (error instanceof Error && "code" in error && error.code === SESSION_FILE_ERROR_CODE.NOT_FOUND) {
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
export async function pruneCommand(options: PruneOptions): Promise<TerminalText> {
  // Validate options
  validatePruneOptions(options);

  const keep = options.keep ?? DOMAIN_DEFAULT_KEEP_COUNT;
  const dryRun = options.dryRun ?? false;

  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning, options.cwd);

  // Load and sort sessions
  const sessions = await loadArchiveSessions(config);
  const toPrune = selectSessionsToDelete(sessions, { keep });

  if (toPrune.length === 0) {
    return terminal`${authoredText(SESSION_PRUNE_OUTPUT.NOTHING_TO_PRUNE)} ${authoredText(String(sessions.length))} ${
      authoredText(SESSION_PRUNE_OUTPUT.SESSIONS_KEPT)
    }`;
  }

  // Dry run mode
  if (dryRun) {
    return renderPruneSummary(SESSION_PRUNE_OUTPUT.WOULD_DELETE, toPrune, sessions.length, true);
  }

  // Delete sessions
  for (const session of toPrune) {
    await unlink(session.path);
  }

  return renderPruneSummary(SESSION_PRUNE_OUTPUT.DELETED, toPrune, sessions.length, false);
}

/**
 * Renders the prune summary: a headline count, one line per pruned session, and the kept count.
 * Counts and labels are the product's own, while each session id is a value read from the archive
 * store, so only the ids are escaped.
 */
function renderPruneSummary(
  headline: string,
  toPrune: readonly Session[],
  totalSessions: number,
  dryRun: boolean,
): TerminalText {
  const keptLabel = dryRun ? SESSION_PRUNE_OUTPUT.SESSIONS_WOULD_BE_KEPT : SESSION_PRUNE_OUTPUT.SESSIONS_KEPT;
  return joinTerminalText(PRUNE_LINE_SEPARATOR, [
    terminal`${authoredText(headline)} ${authoredText(String(toPrune.length))} ${
      authoredText(SESSION_PRUNE_OUTPUT.SESSIONS_SUFFIX)
    }`,
    ...toPrune.map((session) => terminal`${authoredText(PRUNE_ITEM_PREFIX)}${externalValue(session.id)}`),
    authoredText(""),
    terminal`${authoredText(String(totalSessions - toPrune.length))} ${authoredText(keptLabel)}`,
  ]);
}
