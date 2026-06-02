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
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
  isRootWorktree,
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
 * Result of the handoff command. The descriptor writes `output` to stdout and
 * `warning`, when present, to stderr. The handler does not touch process streams.
 */
export interface HandoffResult {
  /** Stdout text including `<HANDOFF_ID>` and `<SESSION_FILE>` tags. */
  output: string;
  /** Optional stderr diagnostic surfaced by session-config resolution. */
  warning?: string;
}

/**
 * Gathers the git facts the handoff-base gate needs (I/O), then resolves the
 * git ref to record. Origin facts are consulted only for a detached linked
 * worktree; an on-branch linked worktree is refused without resolving origin.
 */
async function resolveSessionGitRef(
  cwd: string | undefined,
  deps: GitDependencies | undefined,
): Promise<string> {
  const [isRoot, branch, headSha] = await Promise.all([
    isRootWorktree(cwd, deps),
    getCurrentBranch(cwd, deps),
    getHeadSha(cwd, deps),
  ]);

  let isClean = false;
  let defaultTipSha: string | null = null;
  if (!isRoot && branch === null) {
    const [clean, defaultBranch] = await Promise.all([
      isWorkingTreeClean(cwd, deps),
      resolveDefaultBranch(cwd, deps),
    ]);
    isClean = clean;
    defaultTipSha = defaultBranch === null
      ? null
      : await resolveRefSha(`${ORIGIN_REF_PREFIX}${defaultBranch}`, cwd, deps);
  }

  return resolveHandoffGitRef({
    isRootWorktree: isRoot,
    branch,
    headSha,
    isClean,
    defaultTipSha,
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
 *   `<SESSION_FILE>` tags for the descriptor to write to stdout, and whose
 *   optional `warning` carries the session-config diagnostic for the
 *   descriptor to write to stderr.
 * @throws {SessionInvalidContentError} When stdin is empty or whitespace-only
 * @throws {SessionLegacyFrontmatterInputError} When stdin opens with `---\n`
 * @throws {SessionInvalidJsonHeaderError} When the JSON header is malformed
 *   or fails caller-field schema validation
 * @throws {SessionInvalidGoalError} When the parsed `goal` is empty
 * @throws {SessionInvalidNextStepError} When the parsed `next_step` is empty
 * @throws {SessionHandoffBaseError} When the git work context cannot anchor a base
 */
export async function handoffCommand(options: HandoffOptions): Promise<HandoffResult> {
  const { config, warning } = await resolveSessionConfig({
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
  return { output, warning };
}
