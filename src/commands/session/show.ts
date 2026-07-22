/**
 * Session show CLI command handler.
 *
 * @module commands/session/show
 */

import { readFile, stat } from "node:fs/promises";

import { BatchError, type BatchItemResult, processBatch } from "@/domains/session/batch";
import { SessionNotFoundError } from "@/domains/session/errors";
import { parseSessionMetadata, type SessionRecord, toSessionRecord } from "@/domains/session/list";
import { formatShowOutput, resolveSessionPaths, SEARCH_ORDER, SessionDirectoryConfig } from "@/domains/session/show";
import { SESSION_FILE_ENCODING, SessionStatus } from "@/domains/session/types";
import { SESSION_LIST_FORMAT, type SessionListFormat } from "./list";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

/**
 * Options for the show command.
 */
export interface ShowOptions {
  /** Session ID(s) to show */
  sessionIds: string[];
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Current working directory for default session-store resolution. */
  cwd?: string;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
  /** Output format: text (the default header + body) or the parsed-frontmatter JSON record. */
  format?: SessionListFormat;
}

/**
 * Finds the first existing path and its status.
 */
async function findExistingPath(
  paths: string[],
  _config: SessionDirectoryConfig,
): Promise<{ path: string; status: SessionStatus } | null> {
  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        return { path: filePath, status: SEARCH_ORDER[i] };
      }
    } catch {
      // File doesn't exist, continue
    }
  }
  return null;
}

/**
 * Resolves a session id to its status and raw file content, searching the status
 * directories in {@link SEARCH_ORDER}.
 *
 * @throws {SessionNotFoundError} When no status directory holds the session
 */
export async function resolveSession(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<{ status: SessionStatus; path: string; content: string }> {
  const paths = resolveSessionPaths(sessionId, config);
  const found = await findExistingPath(paths, config);

  if (!found) {
    throw new SessionNotFoundError(sessionId);
  }

  const content = await readFile(found.path, SESSION_FILE_ENCODING);
  return { status: found.status, path: found.path, content };
}

/**
 * Shows a single session by ID as the text header-and-body view.
 */
async function showSingle(
  sessionId: string,
  config: SessionDirectoryConfig,
): Promise<string> {
  const { status, content } = await resolveSession(sessionId, config);
  return formatShowOutput(content, { status });
}

/**
 * Renders one or more sessions as the parsed-frontmatter JSON record contract of
 * `spx/36-session.enabler/43-session-store.enabler`. A single id yields the bare
 * record object; several ids yield a JSON array of records in the supplied order.
 * Every id is resolved before any failure is reported, mirroring the variadic
 * contract; any unresolved id throws {@link BatchError} naming the failed ids, so
 * the descriptor surfaces the diagnostic on stderr and emits no record JSON.
 *
 * @throws {BatchError} When one or more ids cannot be resolved
 */
async function showJson(
  sessionIds: readonly string[],
  config: SessionDirectoryConfig,
): Promise<string> {
  const results: BatchItemResult[] = [];
  const records: SessionRecord[] = [];

  for (const id of sessionIds) {
    try {
      const { status, path, content } = await resolveSession(id, config);
      records.push(toSessionRecord({ id, status, path, metadata: parseSessionMetadata(content) }));
      results.push({ id, ok: true, message: "" });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      results.push({ id, ok: false, message });
    }
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    const failureLines = failures.map((result) => `Error (${result.id}): ${result.message}`).join("\n");
    const error = new BatchError(results);
    error.message = `${error.message}\n\n${failureLines}`;
    throw error;
  }

  const payload: SessionRecord | SessionRecord[] = records.length === 1 ? records[0] : records;
  return JSON.stringify(payload, null, 2);
}

/**
 * Executes the show command for one or more session IDs.
 *
 * Text format renders each session's metadata header and body; JSON format emits
 * the parsed-frontmatter record(s) — a bare object for one id, an array for many.
 *
 * @param options - Command options with one or more session IDs
 * @returns Formatted output for display
 * @throws {BatchError} When one or more IDs fail
 */
export async function showCommand(options: ShowOptions): Promise<string> {
  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning, options.cwd);

  if (options.format === SESSION_LIST_FORMAT.JSON) {
    return showJson(options.sessionIds, config);
  }

  return processBatch(options.sessionIds, (id) => showSingle(id, config));
}
