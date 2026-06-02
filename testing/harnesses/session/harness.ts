/**
 * Session test harness — reusable fixture factory for session tests.
 *
 * Provides temp directory creation, session file writing, and status directory
 * lookup. All values derive from SESSION_STATUSES and DEFAULT_CONFIG — no
 * hardcoded status strings.
 *
 * @module session/testing/harness
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { buildSessionFrontMatterContent, stringifySessionFrontMatter } from "@/domains/session/create";
import { DEFAULT_PRIORITY, SESSION_STATUSES, type SessionPriority, type SessionStatus } from "@/domains/session/types";
import {
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_HEAD_SHA_ARGS,
  GIT_ORIGIN_HEAD_REF_ARGS,
  GIT_ROOT_COMMAND,
  GIT_SHOW_TOPLEVEL_ARGS,
  GIT_STATUS_PORCELAIN_ARGS,
  type GitDependencies,
} from "@/git/root";
import type { HandoffHeaderFixture } from "@testing/generators/session/session";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const { statusDirs } = DEFAULT_CONFIG.sessions;

export function buildSessionMarkdownBody(title: string): string {
  return `# ${title}`;
}

/**
 * Compose stdin input for `spx session handoff` per the JSON-prefix input
 * contract declared by `spx/36-session.enabler/11-session-frontmatter.pdr.md`:
 * a single-line JSON object holding caller-supplied structured fields,
 * followed by a newline, followed by the body bytes verbatim.
 *
 * Uses `JSON.stringify` so every caller string is unambiguously quoted by
 * definition — no plain-scalar ambiguity, no `#`-as-comment truncation, no
 * leading-character traps.
 */
export function buildHandoffStdin(header: HandoffHeaderFixture, body: string): string {
  return `${JSON.stringify(header)}\n${body}`;
}

/** Worktree kind the handoff git-context double simulates. */
export const WORKTREE_KIND = {
  ROOT: "root",
  LINKED: "linked",
} as const;

export type WorktreeKind = (typeof WORKTREE_KIND)[keyof typeof WORKTREE_KIND];

/**
 * Caller-overridable git state for the handoff git-context double.
 *
 * The double simulates the worktree kind, HEAD state, default branch, and
 * working-tree cleanliness that `spx session handoff` reads when it resolves
 * `git_ref` and applies the handoff-base gate per
 * `spx/36-session.enabler/11-session-frontmatter.pdr.md`. Defaults represent
 * the common case: the root worktree on `main` with a clean tree.
 */
export interface SessionGitDepsOverrides {
  /** Root (working tree at the Git common-dir product root) or linked worktree. Default root. */
  readonly worktreeKind?: WorktreeKind;
  /** Checked-out branch name, or `null` when HEAD is detached. Default "main". */
  readonly branch?: string | null;
  /** Working tree clean (empty `git status --porcelain`). Default `true`. */
  readonly clean?: boolean;
  /** Default branch name resolved from `origin/HEAD`. Default "main". */
  readonly defaultBranch?: string;
  /** When HEAD is detached, whether it sits at the tip of `origin/<defaultBranch>`. Default `false`. */
  readonly detachedAtDefaultTip?: boolean;
}

/** Toplevel + common-dir pairs that make `dirname(commonDir) === toplevel` hold only for the root worktree. */
const ROOT_TOPLEVEL = "/repo";
const LINKED_TOPLEVEL = "/repo/.worktrees/wt";
const SHARED_COMMON_DIR = "/repo/.git";

/** Distinct 40-hex SHAs so "HEAD is at the default tip" is decided by equality, not coincidence. */
export const HEAD_SHA = "1111111111111111111111111111111111111111";
export const ORIGIN_DEFAULT_SHA = "2222222222222222222222222222222222222222";

const DEFAULT_GIT_DEPS_BRANCH = "main";
const DEFAULT_GIT_DEPS_DEFAULT_BRANCH = "main";
const DIRTY_PORCELAIN_LINE = " M file.txt";
const DETACHED_HEAD_REF = "HEAD";

/** Whether a git arg vector equals the expected vector exactly. */
function argsEqual(args: readonly string[], expected: readonly string[]): boolean {
  return args.length === expected.length && args.every((arg, index) => arg === expected[index]);
}

/**
 * Builds a `GitDependencies` double that returns canned `git` output for the
 * command set the handoff-base resolution consults:
 *
 * - `rev-parse --show-toplevel` / `rev-parse --git-common-dir` — worktree kind
 * - `rev-parse --abbrev-ref HEAD` — branch name, or `HEAD` when detached
 * - `rev-parse HEAD` — the HEAD commit SHA
 * - `symbolic-ref --short refs/remotes/origin/HEAD` — `origin/<default>`
 * - `rev-parse origin/<default>` — the default branch's tip SHA
 * - `status --porcelain` — empty when the working tree is clean
 *
 * This is the canonical Stage-5 Exception-1 (external-system) substitute used
 * by the session handoff tests under `tests/`. Any other `git` invocation
 * returns a non-zero exit code so unexpected git calls surface as test failures
 * rather than silent success.
 */
export function createSessionGitDeps(overrides: SessionGitDepsOverrides = {}): GitDependencies {
  const worktreeKind = overrides.worktreeKind ?? WORKTREE_KIND.ROOT;
  const branch = overrides.branch === undefined ? DEFAULT_GIT_DEPS_BRANCH : overrides.branch;
  const clean = overrides.clean ?? true;
  const defaultBranch = overrides.defaultBranch ?? DEFAULT_GIT_DEPS_DEFAULT_BRANCH;
  const detachedAtDefaultTip = overrides.detachedAtDefaultTip ?? false;

  const toplevel = worktreeKind === WORKTREE_KIND.ROOT ? ROOT_TOPLEVEL : LINKED_TOPLEVEL;
  const headSha = branch === null && detachedAtDefaultTip ? ORIGIN_DEFAULT_SHA : HEAD_SHA;
  const originDefaultRef = `origin/${defaultBranch}`;

  return {
    execa: async (_command, args) => {
      const ok = (stdout: string): { exitCode: number; stdout: string; stderr: string } => ({
        exitCode: 0,
        stdout,
        stderr: "",
      });

      // Each branch matches the exact production arg vector from `@/git/root`,
      // so the double tracks the pinned command set rather than substrings and
      // the three-arg `--abbrev-ref HEAD` form cannot collide with `rev-parse HEAD`.
      if (argsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) return ok(toplevel);
      if (argsEqual(args, GIT_COMMON_DIR_ARGS)) return ok(SHARED_COMMON_DIR);
      if (argsEqual(args, GIT_CURRENT_BRANCH_ARGS)) return ok(branch ?? DETACHED_HEAD_REF);
      if (argsEqual(args, GIT_ORIGIN_HEAD_REF_ARGS)) return ok(originDefaultRef);
      if (argsEqual(args, GIT_STATUS_PORCELAIN_ARGS)) return ok(clean ? "" : DIRTY_PORCELAIN_LINE);
      if (argsEqual(args, [GIT_ROOT_COMMAND.REV_PARSE, originDefaultRef])) return ok(ORIGIN_DEFAULT_SHA);
      if (argsEqual(args, GIT_HEAD_SHA_ARGS)) return ok(headSha);

      return { exitCode: 1, stdout: "", stderr: "" };
    },
  };
}

/**
 * Metadata options for writing a session file.
 */
export interface SessionMetadataOptions {
  /** Priority level. Defaults to medium. */
  priority?: SessionPriority;
  /** Git ref the session was cut from — a branch name or a commit SHA. */
  git_ref?: string;
  /** Handoff goal. */
  goal?: string;
  /** First next action. */
  next_step?: string;
  /** Spec paths to inject on pickup. */
  specs?: readonly string[];
  /** File paths to inject on pickup. */
  files?: readonly string[];
  /** Additional YAML fields as raw string lines. */
  extraYaml?: string[];
}

/**
 * Session test harness interface.
 */
export interface SessionHarness {
  /** Absolute path to the temp sessions root directory. */
  readonly sessionsDir: string;

  /** Returns the absolute path to the directory for the given status. */
  statusDir(status: SessionStatus): string;

  /** Writes a session file with YAML front matter in the given status directory. */
  writeSession(status: SessionStatus, id: string, opts?: SessionMetadataOptions): Promise<string>;

  /**
   * Writes a session file with the exact `content` bytes in the given status
   * directory. Unlike `writeSession`, this performs no frontmatter composition,
   * so it can materialize sessions of any frontmatter shape — frontmatter that
   * omits a declared key or carries keys absent from the current shape — that
   * the structured writer cannot produce.
   */
  writeRawSession(status: SessionStatus, id: string, content: string): Promise<string>;

  /** Removes the temp directory and all contents. */
  cleanup(): Promise<void>;
}

/**
 * Creates a session test harness with a temp directory containing
 * one subdirectory per member of SESSION_STATUSES.
 *
 * @returns A harness with helpers for writing sessions and cleanup
 */
export async function createSessionHarness(): Promise<SessionHarness> {
  const sessionsDir = await createTempDir("spx-session-harness-");

  // Create one subdirectory per status, derived from DEFAULT_CONFIG
  for (const status of SESSION_STATUSES) {
    await mkdir(join(sessionsDir, statusDirs[status]), { recursive: true });
  }

  return {
    sessionsDir,

    statusDir(status: SessionStatus): string {
      return join(sessionsDir, statusDirs[status]);
    },

    async writeSession(
      status: SessionStatus,
      id: string,
      opts: SessionMetadataOptions = {},
    ): Promise<string> {
      const frontMatter = stringifySessionFrontMatter({
        priority: opts.priority ?? DEFAULT_PRIORITY,
        git_ref: opts.git_ref ?? DEFAULT_GIT_DEPS_BRANCH,
        goal: opts.goal ?? `Goal for ${id}`,
        next_step: opts.next_step ?? `Next step for ${id}`,
        specs: opts.specs,
        files: opts.files,
      });
      const lines = [
        ...frontMatter.split("\n"),
        ...(opts.extraYaml ?? []),
      ];

      const content = buildSessionFrontMatterContent(lines, `# Session ${id}\n`);
      const filePath = join(sessionsDir, statusDirs[status], `${id}.md`);
      await writeFile(filePath, content);
      return filePath;
    },

    async writeRawSession(
      status: SessionStatus,
      id: string,
      content: string,
    ): Promise<string> {
      const filePath = join(sessionsDir, statusDirs[status], `${id}.md`);
      await writeFile(filePath, content);
      return filePath;
    },

    cleanup(): Promise<void> {
      return removeTempDir(sessionsDir);
    },
  };
}
