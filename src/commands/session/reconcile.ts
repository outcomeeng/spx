/**
 * Session reconcile CLI command handler.
 *
 * Resolves a session's recorded references — its `git_ref` branch and its
 * `specs` / `files` entries — against current repository state and emits one
 * verdict per reference as JSON. Reconciliation reports state and never
 * repairs it: the handler only reads.
 *
 * @module commands/session/reconcile
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseSessionMetadata } from "@/domains/session/list";
import {
  ENTRY_PROBE_OUTCOME,
  type EntryProbeOutcome,
  GIT_REF_PROBE_OUTCOME,
  type GitRefProbeOutcome,
  type ReconcileFinding,
  reconcileReferences,
} from "@/domains/session/reconcile";
import { SESSION_FILE_ENCODING, SESSION_FILE_ERROR_CODE } from "@/domains/session/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  defaultGitDependencies,
  GIT_ROOT_COMMAND,
  type GitDependencies,
  REMOTE_ORIGIN_REF_PREFIX,
} from "@/lib/git/root";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";
import { resolveSession } from "./show";

/** `show-ref --verify --quiet` reports a missing ref with this exit code; any other non-zero exit is a git failure. */
const GIT_SHOW_REF_ABSENT_EXIT_CODE = 1;

/** The filesystem error code a directory read reports. */
const ENTRY_DIRECTORY_ERROR_CODE = "EISDIR";

/** JSON indentation for the emitted findings. */
const RECONCILE_JSON_INDENT = 2;

/** Injectable read boundaries for focused reconcile tests. */
export interface ReconcileDependencies {
  readonly readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  readonly git: GitDependencies;
}

const RECONCILE_DEPS: ReconcileDependencies = {
  readFile,
  git: defaultGitDependencies,
};

/** Options for the reconcile command. */
export interface ReconcileOptions {
  /** Session ID whose recorded references are reconciled. */
  sessionId: string;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Current working directory for session-store resolution, git probes, and relative entry paths. */
  cwd?: string;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
  /** Injectable read boundaries for focused reconcile tests. */
  deps?: ReconcileDependencies;
}

/**
 * Probes whether the recorded ref exists as an exact `origin` remote-tracking
 * branch. Exit 0 is present; the ref-missing exit is absent; any other exit or
 * a failed invocation means git could not answer.
 */
async function probeGitRef(ref: string, cwd: string, git: GitDependencies): Promise<GitRefProbeOutcome> {
  try {
    const result = await git.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [
        GIT_ROOT_COMMAND.SHOW_REF,
        GIT_ROOT_COMMAND.VERIFY,
        GIT_ROOT_COMMAND.QUIET,
        `${REMOTE_ORIGIN_REF_PREFIX}${ref}`,
      ],
      { cwd, reject: false },
    );
    if (result.exitCode === 0) return GIT_REF_PROBE_OUTCOME.PRESENT_ON_ORIGIN;
    if (result.exitCode === GIT_SHOW_REF_ABSENT_EXIT_CODE) return GIT_REF_PROBE_OUTCOME.ABSENT_FROM_ORIGIN;
    return GIT_REF_PROBE_OUTCOME.UNANSWERABLE;
  } catch {
    return GIT_REF_PROBE_OUTCOME.UNANSWERABLE;
  }
}

/**
 * Probes one recorded entry by attempting to read it as a file: readable is
 * confirmed territory, an absent path or a directory is a discrepancy, and any
 * other read failure means the entry could not be evaluated.
 */
async function probeEntry(
  listedPath: string,
  cwd: string,
  deps: ReconcileDependencies,
): Promise<EntryProbeOutcome> {
  try {
    await deps.readFile(resolve(cwd, listedPath), SESSION_FILE_ENCODING);
    return ENTRY_PROBE_OUTCOME.READABLE_FILE;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === SESSION_FILE_ERROR_CODE.NOT_FOUND) return ENTRY_PROBE_OUTCOME.ABSENT;
    if (code === ENTRY_DIRECTORY_ERROR_CODE) return ENTRY_PROBE_OUTCOME.DIRECTORY;
    return ENTRY_PROBE_OUTCOME.UNREADABLE;
  }
}

/**
 * Executes the reconcile command: loads the session, probes every recorded
 * reference, and returns the findings as JSON — one verdict per reference.
 *
 * @throws {SessionNotFoundError} When no status directory holds the session
 */
export async function reconcileCommand(options: ReconcileOptions): Promise<string> {
  const deps = options.deps ?? RECONCILE_DEPS;
  const cwd = options.cwd ?? CONFIG_PROCESS_CWD.read();
  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning, cwd);

  const { content } = await resolveSession(options.sessionId, config);
  const metadata = parseSessionMetadata(content);

  const gitRef = metadata.git_ref === "" ? undefined : await probeGitRef(metadata.git_ref, cwd, deps.git);
  const specs = await probeEntries(metadata.specs, cwd, deps);
  const files = await probeEntries(metadata.files, cwd, deps);

  const findings: ReconcileFinding[] = reconcileReferences(metadata, { gitRef, specs, files });
  return JSON.stringify(findings, null, RECONCILE_JSON_INDENT);
}

async function probeEntries(
  entries: readonly string[],
  cwd: string,
  deps: ReconcileDependencies,
): Promise<EntryProbeOutcome[]> {
  const outcomes: EntryProbeOutcome[] = [];
  for (const entry of entries) {
    outcomes.push(await probeEntry(entry, cwd, deps));
  }
  return outcomes;
}
