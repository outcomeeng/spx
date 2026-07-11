/**
 * Session pickup CLI command handler.
 *
 * @module commands/session/pickup
 */

import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

import { processBatch } from "@/domains/session/batch";
import { NoSessionsAvailableError } from "@/domains/session/errors";
import { parseSessionMetadata } from "@/domains/session/list";
import { buildClaimPaths, classifyClaimError, selectBestSession } from "@/domains/session/pickup";
import { formatShowOutput, SessionDirectoryConfig } from "@/domains/session/show";
import {
  CLAIMABLE_STATUS,
  formatSessionOutputMarker,
  Session,
  SESSION_FILE_ENCODING,
  SESSION_FILE_ERROR_CODE,
  SESSION_OUTPUT_MARKER,
  SESSION_STATUSES,
  SessionStatus,
} from "@/domains/session/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

/** Status of sessions after being claimed. */
const PICKUP_TARGET_STATUS: SessionStatus = SESSION_STATUSES[1]; // doing

/**
 * Options for the pickup command.
 */
export interface PickupOptions {
  /** Session IDs to pickup. Empty array is valid only with auto. */
  sessionIds: readonly string[];
  /** Auto-select highest priority session */
  auto?: boolean;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Current working directory used for session-store resolution and relative injection paths. */
  cwd?: string;
  /** Skip reading and printing session `specs` / `files` references. */
  noInject?: boolean;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
  /** Injectable filesystem boundary for focused pickup tests. */
  deps?: PickupDependencies;
}

export interface PickupDependencies {
  readonly mkdir: (path: string, options: { readonly recursive: true }) => Promise<string | undefined>;
  readonly readdir: (path: string) => Promise<string[]>;
  readonly readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  readonly rename: (oldPath: string, newPath: string) => Promise<void>;
}

const PICKUP_DEPS: PickupDependencies = {
  mkdir,
  readdir,
  readFile,
  rename,
};

/**
 * Loads sessions from the claimable-session directory.
 */
export async function loadTodoSessions(config: SessionDirectoryConfig): Promise<Session[]> {
  return loadTodoSessionsWithDeps(config, PICKUP_DEPS);
}

async function loadTodoSessionsWithDeps(config: SessionDirectoryConfig, deps: PickupDependencies): Promise<Session[]> {
  try {
    const files = await deps.readdir(config.todoDir);
    const sessions: Session[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const id = file.replace(".md", "");
      const filePath = join(config.todoDir, file);
      const content = await deps.readFile(filePath, SESSION_FILE_ENCODING);
      const metadata = parseSessionMetadata(content);

      sessions.push({
        id,
        status: CLAIMABLE_STATUS,
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

/** Delimiter prefix introducing an auto-injected file section. */
export const SESSION_INJECTION_SECTION_PREFIX = "Injected file";
/** Warning prefix for a listed injection path that is absent. */
export const SESSION_INJECTION_MISSING_WARNING_PREFIX = "Warning: missing session injection file";
/** Warning prefix for a listed injection path that exists but cannot be read as a file, such as a directory. */
export const SESSION_INJECTION_UNREADABLE_WARNING_PREFIX = "Warning: unreadable session injection path";

function injectionPath(cwd: string, filePath: string): string {
  return resolve(cwd, filePath);
}

function formatInjectedFile(listedPath: string, content: string): string {
  return `${SESSION_INJECTION_SECTION_PREFIX}: ${listedPath}\n${content}`;
}

/**
 * Builds the warning for a listed injection path that could not be read, naming
 * the path. An absent path reports the missing-file prefix; any other read
 * failure, such as a directory entry's EISDIR, reports the unreadable prefix.
 */
function formatInjectionWarning(error: unknown, listedPath: string): string {
  const isAbsent = error instanceof Error && "code" in error && error.code === SESSION_FILE_ERROR_CODE.NOT_FOUND;
  const prefix = isAbsent ? SESSION_INJECTION_MISSING_WARNING_PREFIX : SESSION_INJECTION_UNREADABLE_WARNING_PREFIX;
  return `${prefix}: ${listedPath}`;
}

async function readInjectedFiles(
  metadata: Session["metadata"],
  cwd: string,
  deps: PickupDependencies,
  onWarning?: SessionWarningHandler,
): Promise<string[]> {
  const sections: string[] = [];
  for (const listedPath of [...metadata.specs, ...metadata.files]) {
    // The claim has already committed, so an injection read that throws for any
    // reason degrades to a warning naming the path rather than aborting pickup.
    try {
      const content = await deps.readFile(injectionPath(cwd, listedPath), SESSION_FILE_ENCODING);
      sections.push(formatInjectedFile(listedPath, content));
    } catch (error) {
      onWarning?.(formatInjectionWarning(error, listedPath));
    }
  }
  return sections;
}

/**
 * Claims one session from the claimable queue and moves it to doing.
 */
async function pickupSingle(
  sessionId: string,
  config: SessionDirectoryConfig,
  cwd: string,
  deps: PickupDependencies,
  noInject: boolean,
  onWarning?: SessionWarningHandler,
): Promise<string> {
  const paths = buildClaimPaths(sessionId, config);
  await deps.mkdir(config.doingDir, { recursive: true });

  try {
    await deps.rename(paths.source, paths.target);
  } catch (error) {
    throw classifyClaimError(error, sessionId);
  }

  const content = await deps.readFile(paths.target, SESSION_FILE_ENCODING);
  const metadata = parseSessionMetadata(content);
  const output = formatShowOutput(content, { status: PICKUP_TARGET_STATUS });
  const injected = noInject ? [] : await readInjectedFiles(metadata, cwd, deps, onWarning);
  const injectionOutput = injected.length === 0 ? "" : `\n\n${injected.join("\n\n")}`;

  return `Claimed session ${
    formatSessionOutputMarker(SESSION_OUTPUT_MARKER.PICKUP_ID, sessionId)
  }\n\n${output}${injectionOutput}`;
}

/**
 * Executes the pickup command.
 *
 * Claims one or more sessions from the claimable queue and moves them to doing.
 * Output includes one `<PICKUP_ID>` tag per claimed session for automation.
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session IDs
 * @throws {NoSessionsAvailableError} When no sessions are available for auto mode
 * @throws {SessionNotAvailableError} When one or more sessions cannot be claimed
 * @throws {BatchError} When one or more explicit IDs fail
 */
export async function pickupCommand(options: PickupOptions): Promise<string> {
  const deps = options.deps ?? PICKUP_DEPS;
  const cwd = options.cwd ?? CONFIG_PROCESS_CWD.read();
  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning, cwd);
  const noInject = options.noInject === true;

  if (options.auto) {
    if (options.sessionIds.length > 0) {
      throw new Error("Session IDs cannot be combined with --auto");
    }

    const sessions = await loadTodoSessionsWithDeps(config, deps);
    const selected = selectBestSession(sessions);

    if (!selected) {
      throw new NoSessionsAvailableError();
    }

    return pickupSingle(selected.id, config, cwd, deps, noInject, options.onWarning);
  }

  if (options.sessionIds.length === 0) {
    throw new Error("Either session ID or --auto flag is required");
  }

  if (options.sessionIds.length === 1) {
    return pickupSingle(options.sessionIds[0], config, cwd, deps, noInject, options.onWarning);
  }

  return processBatch(options.sessionIds, (id) => pickupSingle(id, config, cwd, deps, noInject, options.onWarning));
}
