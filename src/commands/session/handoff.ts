/**
 * Session handoff CLI command handler.
 *
 * Creates a new session for handoff to another agent context. Caller-supplied
 * structured fields come from a JSON object at the start of stdin; the body is
 * the remaining bytes verbatim. The on-disk file format remains YAML
 * frontmatter + markdown body, written through the `yaml` package's
 * `stringify`.
 *
 * @module commands/session/handoff
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN } from "@/domains/session/create";
import {
  SessionInvalidContentError,
  SessionInvalidGoalError,
  SessionInvalidNextStepError,
} from "@/domains/session/errors";
import { resolveHandoffGitRef } from "@/domains/session/handoff-base";
import { parseHandoffInput } from "@/domains/session/parse-handoff-input";
import { generateSessionId } from "@/domains/session/timestamp";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";
import {
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
  isWorkingTreeClean,
  ORIGIN_REF_PREFIX,
  resolveDefaultBranch,
  resolveRefSha,
  resolveSessionConfig,
} from "@/git/root";

/**
 * Options for the handoff command.
 */
export interface HandoffOptions {
  /** Session content from stdin. */
  content?: string;
  /** Custom sessions directory */
  sessionsDir?: string;
  /** Current working directory for Git context detection */
  cwd?: string;
  /** Injectable Git command dependencies for tests */
  deps?: GitDependencies;
}

/**
 * Result of the handoff command. The descriptor writes `output` to stdout. The
 * handler does not touch process streams.
 */
export interface HandoffResult {
  /** Stdout text including `<HANDOFF_ID>` and `<SESSION_FILE>` tags. */
  output: string;
}

/**
 * Gathers every git fact the handoff-base gate evaluates (I/O), then resolves
 * the git ref to record. Every fact a linked-worktree refusal checklist renders
 * is gathered regardless of branch state, so the resolver evaluates every base
 * prerequisite and surfaces it — never short-circuiting on an earlier fact.
 */
async function resolveSessionGitRef(
  cwd: string | undefined,
  deps: GitDependencies | undefined,
): Promise<string> {
  const [branch, headSha, gitRoots] = await Promise.all([
    getCurrentBranch(cwd, deps),
    getHeadSha(cwd, deps),
    detectGitCommonDirProductRoot(cwd, deps),
  ]);

  // `detectGitCommonDirProductRoot` reads `--show-toplevel` once and returns both
  // the worktree root and the Git common-dir product root, so no second
  // `--show-toplevel` is needed for the current-worktree path.
  const currentWorktreePath = gitRoots.worktreeRoot ?? gitRoots.productDir;
  const rootWorktreePath = gitRoots.productDir;
  // The root worktree is the one whose toplevel is the Git common-dir product
  // root; a linked worktree resolves to a path beneath it.
  const isRoot = currentWorktreePath === rootWorktreePath;

  // The clean-tree and origin facts feed only the linked-worktree refusal
  // checklist; a root-worktree base (permitted regardless of HEAD state) and a
  // non-git base never consult them, so gather them only for a linked worktree
  // in a git repository. Every linked worktree — detached or on a branch — still
  // gathers all of them, so the resolver evaluates every prerequisite.
  let isClean = false;
  let defaultBranch: string | null = null;
  let defaultTipSha: string | null = null;
  if (gitRoots.isGitRepo && !isRoot) {
    [isClean, defaultBranch] = await Promise.all([
      isWorkingTreeClean(cwd, deps),
      resolveDefaultBranch(cwd, deps),
    ]);
    defaultTipSha = defaultBranch === null
      ? null
      : await resolveRefSha(`${ORIGIN_REF_PREFIX}${defaultBranch}`, cwd, deps);
  }

  return resolveHandoffGitRef({
    isGitRepo: gitRoots.isGitRepo,
    isRootWorktree: isRoot,
    branch,
    headSha,
    isClean,
    defaultBranch,
    defaultTipSha,
    currentWorktreePath,
    rootWorktreePath,
  });
}

/**
 * Executes the handoff command.
 *
 * Creates a new session in the todo directory for pickup by another context.
 * Output includes `<HANDOFF_ID>` and `<SESSION_FILE>` tags for parsing by
 * automation tools.
 *
 * Caller-supplied structured fields come from a JSON object at the start of
 * stdin; bytes after the JSON object form the markdown body verbatim. The
 * CLI prefills `created_at` from the system clock, `git_ref` from the
 * handoff-base gate (branch name in the root worktree on a branch, HEAD SHA
 * when detached, or the `origin/<default>` tip SHA in a clean detached linked
 * worktree), and `agent_session_id` from `$CLAUDE_SESSION_ID` (falling back to
 * `$CODEX_THREAD_ID`).
 *
 * Canonical invocation:
 *
 *   printf '%s\n' '{"priority":"high","goal":"...","next_step":"..."}' '# Body' | spx session handoff
 *
 * @param options - Command options
 * @returns A `HandoffResult` whose `output` carries the `<HANDOFF_ID>` and
 *   `<SESSION_FILE>` tags for the descriptor to write to stdout.
 * @throws {SessionInvalidContentError} When stdin is empty or whitespace-only
 * @throws {SessionLegacyFrontmatterInputError} When stdin opens with `---\n`
 * @throws {SessionInvalidJsonHeaderError} When the JSON header is malformed
 *   or fails caller-field schema validation
 * @throws {SessionInvalidGoalError} When the parsed `goal` is empty
 * @throws {SessionInvalidNextStepError} When the parsed `next_step` is empty
 * @throws {SessionHandoffBaseError} When the git work context cannot anchor a base
 */
export async function handoffCommand(options: HandoffOptions): Promise<HandoffResult> {
  const { config } = await resolveSessionConfig({
    sessionsDir: options.sessionsDir,
    cwd: options.cwd,
    deps: options.deps,
  });

  const content = options.content;
  if (content === undefined || content.trim().length === 0) {
    throw new SessionInvalidContentError("Session content cannot be empty");
  }

  const { header, body } = parseHandoffInput(content);

  if (header.goal.length === 0) {
    throw new SessionInvalidGoalError();
  }
  if (header.next_step.length === 0) {
    throw new SessionInvalidNextStepError();
  }

  const gitRef = await resolveSessionGitRef(options.cwd, options.deps);

  const sessionId = generateSessionId();
  const agentSessionId = process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  const createdAt = new Date().toISOString();

  const frontMatterObject: Record<string, unknown> = {
    [SESSION_FRONT_MATTER.PRIORITY]: header.priority,
    [SESSION_FRONT_MATTER.CREATED_AT]: createdAt,
    [SESSION_FRONT_MATTER.GIT_REF]: gitRef,
    [SESSION_FRONT_MATTER.GOAL]: header.goal,
    [SESSION_FRONT_MATTER.NEXT_STEP]: header.next_step,
    [SESSION_FRONT_MATTER.SPECS]: [...header.specs],
    [SESSION_FRONT_MATTER.FILES]: [...header.files],
  };
  if (agentSessionId !== undefined) {
    frontMatterObject[SESSION_FRONT_MATTER.AGENT_SESSION_ID] = agentSessionId;
  }

  const yaml = stringifyYaml(frontMatterObject, { defaultStringType: "QUOTE_DOUBLE" }).trimEnd();
  const fullContent = `${SESSION_FRONT_MATTER_OPEN}${yaml}${SESSION_FRONT_MATTER_CLOSE}${body}`;

  const filename = `${sessionId}.md`;
  const sessionPath = join(config.todoDir, filename);
  const absolutePath = resolve(sessionPath);

  await mkdir(config.todoDir, { recursive: true });
  await writeFile(sessionPath, fullContent, "utf-8");

  const output =
    `Created handoff session <HANDOFF_ID>${sessionId}</HANDOFF_ID>\n<SESSION_FILE>${absolutePath}</SESSION_FILE>`;
  return { output };
}
