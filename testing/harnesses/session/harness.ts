/**
 * Session test harness — reusable fixture factory for session tests.
 *
 * Provides temp directory creation, session file writing, and status directory
 * lookup. All values derive from SESSION_STATUSES and DEFAULT_CONFIG — no
 * hardcoded status strings.
 *
 * @module session/testing/harness
 */

import { execa } from "execa";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_CONFIG } from "@/config/defaults";
import { buildSessionFrontMatterContent, stringifySessionFrontMatter } from "@/domains/session/create";
import {
  DEFAULT_PRIORITY,
  SESSION_OUTPUT_MARKER,
  SESSION_STATUSES,
  type SessionPriority,
  type SessionStatus,
} from "@/domains/session/types";
import {
  GIT_COMMON_DIR_ARGS,
  GIT_CORE_BARE_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_HEAD_SHA_ARGS,
  GIT_ORIGIN_HEAD_REF_ARGS,
  GIT_REMOTE_GET_URL_ORIGIN_ARGS,
  GIT_ROOT_COMMAND,
  GIT_SHOW_TOPLEVEL_ARGS,
  GIT_STATUS_PORCELAIN_ARGS,
  type GitDependencies,
  REMOTE_ORIGIN_REF_PREFIX,
} from "@/lib/git/root";
import { sessionsScopeDir } from "@/lib/state-store";
import type { HandoffHeaderFixture } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, gitArgsEqual } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const { statusDirs } = DEFAULT_CONFIG.sessions;

/** Absolute path to the built CLI entry the l2 session tests invoke via `node`. */
export const SESSION_CLI_ENTRY = join(process.cwd(), "bin/spx.js");

/** Internal fields the JSON list output must not leak. */
export const SESSION_FORBIDDEN_JSON_RECORD_FIELD = {
  PATH: "path",
  METADATA: "metadata",
} as const;

/** Captured streams and exit code of a built-executable CLI run. */
export interface SessionCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Runs the built `spx` executable through `node bin/spx.js` for l2 session
 * tests. execa pipes stdio, so the child sees no TTY unless a flag forces it.
 *
 * @param args - CLI arguments after the entry path.
 * @param input - Optional stdin content piped to the process.
 * @param cwd - Working directory for the run (defaults to the test process cwd).
 * @param env - Extra environment variables layered onto the child process.
 */
export async function runSessionCli(
  args: readonly string[],
  input?: string,
  cwd: string = process.cwd(),
  env?: Record<string, string>,
): Promise<SessionCliResult> {
  const result = await execa("node", [SESSION_CLI_ENTRY, ...args], { cwd, input, reject: false, env });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

/** Commit message for the seed commit a session git fixture writes — a fixture value, not a git token. */
export const SESSION_FIXTURE_COMMIT_MESSAGE = "session cli fixture";

/** The `<HANDOFF_ID>` tag `spx session handoff` emits on success, carrying the session id. */
export const HANDOFF_ID_TAG_PATTERN = new RegExp(
  String
    .raw`<${SESSION_OUTPUT_MARKER.HANDOFF_ID}>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}</${SESSION_OUTPUT_MARKER.HANDOFF_ID}>`,
);

/** A session id that resolves to no session file, exercising the per-id failure path. */
export const ABSENT_SESSION_ID = "nonexistent";

/**
 * Provisions a non-bare git worktree with a single seed commit and invokes
 * `callback` with its toplevel — the main checkout from which `spx session
 * handoff` is permitted. Composes `withGitWorktreeEnv`, removing the temp
 * directory on both the return and throw paths.
 */
export async function withCommittedGitCwd(callback: (cwd: string) => Promise<void>): Promise<void> {
  await withGitWorktreeEnv(async (gitEnv) => {
    await gitEnv.runGit([
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      SESSION_FIXTURE_COMMIT_MESSAGE,
    ]);
    await callback(gitEnv.productDir);
  });
}

export function buildSessionMarkdownBody(title: string): string {
  return `# ${title}`;
}

/**
 * Compose stdin input for `spx session handoff` per the JSON-prefix input
 * contract: a single-line JSON object holding caller-supplied structured
 * fields, followed by a newline, followed by the body bytes verbatim.
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
  MAIN_CHECKOUT: "main-checkout",
  NON_MAIN: "non-main",
} as const;

export type WorktreeKind = (typeof WORKTREE_KIND)[keyof typeof WORKTREE_KIND];

/**
 * Caller-overridable git state for the handoff git-context double.
 *
 * The double simulates the worktree kind, HEAD state, default branch, and
 * working-tree cleanliness that `spx session handoff` reads when it resolves
 * `git_ref` and applies the handoff-base gate. Defaults represent the common
 * case: the main checkout on `main` with a clean tree.
 */
export interface SessionGitDepsOverrides {
  /** Main checkout (working tree at the Git common-dir product root) or non-main checkout. Default main checkout. */
  readonly worktreeKind?: WorktreeKind;
  /** Checked-out branch name, or `null` when HEAD is detached. Default "main". */
  readonly branch?: string | null;
  /** Working tree clean (empty `git status --porcelain`). Default `true`. */
  readonly clean?: boolean;
  /** Default branch name resolved from `origin/HEAD`. Default "main". */
  readonly defaultBranch?: string;
  /** When HEAD is detached, whether it sits at the tip of `origin/<defaultBranch>`. Default `false`. */
  readonly detachedAtDefaultTip?: boolean;
  /**
   * Exact remote-branch names (no `origin/` prefix) that exist on `origin` — the
   * double answers `show-ref --verify --quiet refs/remotes/origin/<name>` with
   * exit 0 for each. Any other ref — including a revision expression like
   * `<name>~1` — falls through to a non-zero exit, modeling a branch the
   * handoff's explicit-ref verification cannot find on `origin`. Default empty.
   */
  readonly originWorkBranches?: readonly string[];
}

// Toplevel + common-dir pairs for a non-bare repository: `dirname(commonDir) ===
// toplevel` holds only for the main working tree (`/repo`), so it is the main
// checkout and the linked worktree is not.
const MAIN_CHECKOUT_TOPLEVEL = "/repo";
const NON_MAIN_TOPLEVEL = "/repo/.worktrees/wt";
const SHARED_COMMON_DIR = "/repo/.git";
/** `core.bare` for the non-bare repository the double simulates. */
const NON_BARE_CORE_BARE = "false";
/** The `origin` URL the double returns; a non-bare repository's designation ignores it. */
const SIMULATED_ORIGIN_URL = "https://github.com/example/repo.git";

export const SESSION_GIT_DEPS_PATHS = {
  MAIN_CHECKOUT_TOPLEVEL,
  NON_MAIN_TOPLEVEL,
  SHARED_COMMON_DIR,
} as const;

/** Distinct 40-hex SHAs so "HEAD is at the default tip" is decided by equality, not coincidence. */
export const HEAD_SHA = "1111111111111111111111111111111111111111";
export const ORIGIN_DEFAULT_SHA = "2222222222222222222222222222222222222222";

export const DEFAULT_GIT_DEPS_BRANCH = "main";
const DEFAULT_GIT_DEPS_DEFAULT_BRANCH = "main";
const DIRTY_PORCELAIN_LINE = " M file.txt";
const DETACHED_HEAD_REF = "HEAD";

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
  const worktreeKind = overrides.worktreeKind ?? WORKTREE_KIND.MAIN_CHECKOUT;
  let branch: string | null = DEFAULT_GIT_DEPS_BRANCH;
  if (overrides.branch !== undefined) {
    branch = overrides.branch;
  }
  const clean = overrides.clean ?? true;
  const defaultBranch = overrides.defaultBranch ?? DEFAULT_GIT_DEPS_DEFAULT_BRANCH;
  const detachedAtDefaultTip = overrides.detachedAtDefaultTip ?? false;
  const originWorkRefs = new Set(
    (overrides.originWorkBranches ?? []).map((name) => `${REMOTE_ORIGIN_REF_PREFIX}${name}`),
  );

  const toplevel = worktreeKind === WORKTREE_KIND.MAIN_CHECKOUT ? MAIN_CHECKOUT_TOPLEVEL : NON_MAIN_TOPLEVEL;
  const headSha = branch === null && detachedAtDefaultTip ? ORIGIN_DEFAULT_SHA : HEAD_SHA;
  const originDefaultRef = `origin/${defaultBranch}`;

  return {
    execa: async (_command, args) => {
      const ok = (stdout: string): { exitCode: number; stdout: string; stderr: string } => ({
        exitCode: 0,
        stdout,
        stderr: "",
      });

      // Each branch matches the exact production arg vector from `@/lib/git/root`,
      // so the double tracks the pinned command set rather than substrings and
      // the three-arg `--abbrev-ref HEAD` form cannot collide with `rev-parse HEAD`.
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) return ok(toplevel);
      if (gitArgsEqual(args, GIT_COMMON_DIR_ARGS)) return ok(SHARED_COMMON_DIR);
      if (gitArgsEqual(args, GIT_CURRENT_BRANCH_ARGS)) return ok(branch ?? DETACHED_HEAD_REF);
      if (gitArgsEqual(args, GIT_ORIGIN_HEAD_REF_ARGS)) return ok(originDefaultRef);
      if (gitArgsEqual(args, GIT_STATUS_PORCELAIN_ARGS)) return ok(clean ? "" : DIRTY_PORCELAIN_LINE);
      if (gitArgsEqual(args, [GIT_ROOT_COMMAND.REV_PARSE, originDefaultRef])) return ok(ORIGIN_DEFAULT_SHA);
      // Exact remote-branch existence probe: `show-ref --verify --quiet refs/remotes/origin/<branch>`.
      // Members exit 0 (no stdout); non-members fall through to the exit-1 catch-all, so a
      // revision expression like `<branch>~1` — never an exact ref — is correctly rejected.
      if (
        args.length === 4
        && args[0] === GIT_ROOT_COMMAND.SHOW_REF
        && args[1] === GIT_ROOT_COMMAND.VERIFY
        && args[2] === GIT_ROOT_COMMAND.QUIET
        && originWorkRefs.has(args[3])
      ) {
        return ok("");
      }
      if (gitArgsEqual(args, GIT_HEAD_SHA_ARGS)) return ok(headSha);
      if (gitArgsEqual(args, GIT_REMOTE_GET_URL_ORIGIN_ARGS)) return ok(SIMULATED_ORIGIN_URL);
      if (gitArgsEqual(args, GIT_CORE_BARE_ARGS)) return ok(NON_BARE_CORE_BARE);

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
 * Writes a session file with composed YAML front matter into
 * `join(baseDir, statusDirs[status])`. Shared by the explicit-`sessionsDir`
 * harness and the non-git fallback environment so both compose front matter the
 * same way.
 */
async function writeSessionFileAt(
  baseDir: string,
  status: SessionStatus,
  id: string,
  opts: SessionMetadataOptions,
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
  const filePath = join(baseDir, statusDirs[status], `${id}.md`);
  await writeFile(filePath, content);
  return filePath;
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

  /** Whether the session `id` currently has a file in the given status directory. */
  isInStatus(status: SessionStatus, id: string): Promise<boolean>;

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

    writeSession(
      status: SessionStatus,
      id: string,
      opts: SessionMetadataOptions = {},
    ): Promise<string> {
      return writeSessionFileAt(sessionsDir, status, id, opts);
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

    async isInStatus(status: SessionStatus, id: string): Promise<boolean> {
      try {
        await access(join(sessionsDir, statusDirs[status], `${id}.md`));
        return true;
      } catch {
        return false;
      }
    },

    cleanup(): Promise<void> {
      return removeTempDir(sessionsDir);
    },
  };
}

/**
 * Session environment rooted at a non-git temporary directory, laid out at the
 * `.spx/sessions/` fallback location `resolveSessionConfig` resolves to when the
 * working directory is outside a git repository.
 *
 * Invoke a session subcommand with `cwd` set to this directory and no
 * `--sessions-dir`, so config resolution falls back to the current directory and
 * emits its non-git diagnostic.
 */
export interface NonGitSessionEnv {
  /** Absolute path to the non-git working directory to invoke the CLI from. */
  readonly cwd: string;
  /** Returns the absolute path to a fallback status directory under `.spx/sessions/`. */
  statusDir(status: SessionStatus): string;
  /** Writes a session file with YAML front matter into the given fallback status directory. */
  writeSession(status: SessionStatus, id: string, opts?: SessionMetadataOptions): Promise<string>;
  /** Removes the temp directory and all contents. */
  cleanup(): Promise<void>;
}

/**
 * Creates a non-git session environment: a temp directory holding the
 * `.spx/sessions/{claimable,doing,archive}` fallback layout, with no git repository.
 */
export async function createNonGitSessionEnv(): Promise<NonGitSessionEnv> {
  const cwd = await createTempDir("spx-session-nongit-");
  const sessionsRoot = sessionsScopeDir(cwd);
  for (const status of SESSION_STATUSES) {
    await mkdir(join(sessionsRoot, statusDirs[status]), { recursive: true });
  }

  return {
    cwd,

    statusDir(status: SessionStatus): string {
      return join(sessionsRoot, statusDirs[status]);
    },

    writeSession(
      status: SessionStatus,
      id: string,
      opts: SessionMetadataOptions = {},
    ): Promise<string> {
      return writeSessionFileAt(sessionsRoot, status, id, opts);
    },

    cleanup(): Promise<void> {
      return removeTempDir(cwd);
    },
  };
}
