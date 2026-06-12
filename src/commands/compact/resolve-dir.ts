/**
 * Resolves the per-runtime compaction-stash directory `.spx/sessions/<id>/` by
 * composing the Git common-dir product root with the `DEFAULT_CONFIG` sessions
 * path, decoupled from the session domain per
 * `spx/48-compact.enabler/21-stash-resolution.adr.md`.
 *
 * @module commands/compact/resolve-dir
 */
import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { defaultGitDependencies, detectGitCommonDirProductRoot, type GitDependencies } from "@/git/root";

const PATH_SEPARATOR_PATTERN = /[/\\]/;
const PARENT_DIR_SEGMENT = "..";
const CURRENT_DIR_SEGMENT = ".";

/** Raised when a `--session-id` would escape `.spx/sessions/` as a directory name. */
export class CompactInvalidSessionIdError extends Error {
  constructor() {
    super("Invalid --session-id: it must not be empty or contain a path separator or a '.' / '..' segment");
    this.name = "CompactInvalidSessionIdError";
  }
}

function assertSafeSessionId(sessionId: string): void {
  if (
    sessionId.length === 0
    || sessionId === CURRENT_DIR_SEGMENT
    || sessionId === PARENT_DIR_SEGMENT
    || PATH_SEPARATOR_PATTERN.test(sessionId)
  ) {
    throw new CompactInvalidSessionIdError();
  }
}

export interface ResolveCompactStashDirOptions {
  /** The per-conversation runtime id naming the stash directory. */
  readonly sessionId: string;
  /** Working directory for git detection; defaults to the process cwd. */
  readonly cwd?: string;
  /** Injectable git dependencies for testing. */
  readonly deps?: GitDependencies;
}

export interface ResolveCompactStashDirResult {
  /** Absolute path to `.spx/sessions/<id>/` under the shared Git common-dir root. */
  readonly dir: string;
  /** Warning emitted when the command runs outside a git repository. */
  readonly warning?: string;
}

/** Resolves the shared `.spx/sessions/<id>/` stash directory for `sessionId`. */
export async function resolveCompactStashDir(
  options: ResolveCompactStashDirOptions,
): Promise<ResolveCompactStashDirResult> {
  assertSafeSessionId(options.sessionId);
  const deps = options.deps ?? defaultGitDependencies;
  const gitResult = await detectGitCommonDirProductRoot(options.cwd, deps);
  const dir = join(gitResult.productDir, DEFAULT_CONFIG.sessions.dir, options.sessionId);
  return gitResult.warning === undefined ? { dir } : { dir, warning: gitResult.warning };
}
