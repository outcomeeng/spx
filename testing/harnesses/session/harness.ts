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
import type { GitDependencies } from "@/git/root";
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

/**
 * Caller-overridable values for the git-context double used by handoff tests.
 *
 * Defaults represent a non-worktree repository on `main`. Override `branch`
 * to assert branch-detection round-trips; override `toplevel` and `commonDir`
 * to simulate a linked worktree.
 */
export interface SessionGitDepsOverrides {
  readonly branch?: string;
  readonly toplevel?: string;
  readonly commonDir?: string;
}

const DEFAULT_GIT_DEPS_BRANCH = "main";
const DEFAULT_GIT_DEPS_TOPLEVEL = "/repo";
const DEFAULT_GIT_DEPS_COMMON_DIR = "/repo/.git";

/**
 * Builds a `GitDependencies` double that returns canned `git rev-parse` output
 * for the three flags `handoffCommand` consults (`--abbrev-ref HEAD`,
 * `--show-toplevel`, `--git-common-dir`). The double is the canonical
 * Stage-5 Exception-1 (failure-mode / external-system) substitute used by
 * the session handoff tests under `tests/`.
 *
 * Any other `git` invocation routed through this double returns a non-zero
 * exit code so unexpected git calls surface as test failures rather than
 * silent success.
 */
export function createSessionGitDeps(overrides: SessionGitDepsOverrides = {}): GitDependencies {
  const branch = overrides.branch ?? DEFAULT_GIT_DEPS_BRANCH;
  const toplevel = overrides.toplevel ?? DEFAULT_GIT_DEPS_TOPLEVEL;
  const commonDir = overrides.commonDir ?? DEFAULT_GIT_DEPS_COMMON_DIR;
  return {
    execa: async (_command, args) => {
      const argText = args.join(" ");
      if (argText.includes("--abbrev-ref")) return { exitCode: 0, stdout: branch, stderr: "" };
      if (argText.includes("--show-toplevel")) return { exitCode: 0, stdout: toplevel, stderr: "" };
      if (argText.includes("--git-common-dir")) return { exitCode: 0, stdout: commonDir, stderr: "" };
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
  /** Git branch. */
  branch?: string;
  /** Worktree path relative to the common Git product root. */
  worktree?: string;
  /** Handoff goal. */
  goal?: string;
  /** First next action. */
  next_step?: string;
  /** Archive result. */
  result?: string;
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
   * so it can materialize non-canonical sessions — frontmatter that omits the
   * declared shape or carries excluded keys — that the canonical writer cannot
   * produce.
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
        branch: opts.branch ?? "main",
        worktree: opts.worktree ?? "",
        goal: opts.goal ?? `Goal for ${id}`,
        next_step: opts.next_step ?? `Next step for ${id}`,
        result: opts.result,
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
