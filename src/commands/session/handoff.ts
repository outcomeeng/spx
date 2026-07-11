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

import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { type AgentSessionEnvironment, resolveAgentSessionId } from "@/domains/session/agent-session";
import { SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN } from "@/domains/session/create";
import {
  SessionInjectionDirectoryError,
  SessionInvalidContentError,
  SessionInvalidGoalError,
  SessionInvalidNextStepError,
} from "@/domains/session/errors";
import { resolveHandoffGitRef, resolveWorkBranchGitRef } from "@/domains/session/handoff-base";
import { parseHandoffInput } from "@/domains/session/parse-handoff-input";
import { generateSessionId } from "@/domains/session/timestamp";
import {
  formatSessionOutputMarker,
  SESSION_FILE_ENCODING,
  SESSION_FRONT_MATTER,
  SESSION_OUTPUT_MARKER,
} from "@/domains/session/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  gatherGitFacts,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
  isMainCheckout,
  isWorkingTreeClean,
  mainCheckoutPath,
  ORIGIN_REF_PREFIX,
  originBranchExists,
  resolveDefaultBranch,
  resolveRefSha,
} from "@/lib/git/root";
import { resolveSessionConfig } from "./resolve-config";

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
  /** Environment values used to prefill agent identity */
  env?: AgentSessionEnvironment;
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
 * the git ref to record. Every fact a non-main-checkout refusal checklist renders
 * is gathered regardless of branch state, so the resolver evaluates every base
 * prerequisite and surfaces it — never short-circuiting on an earlier fact.
 */
async function resolveSessionGitRef(
  cwd: string | undefined,
  deps: GitDependencies | undefined,
): Promise<string> {
  const [branch, headSha, facts] = await Promise.all([
    getCurrentBranch(cwd, deps),
    getHeadSha(cwd, deps),
    gatherGitFacts(cwd, deps),
  ]);

  // The probe reads the worktree root once and returns the facts the main-checkout
  // classifier needs, so the worktree path and the main-checkout verdict and path
  // compose from one read.
  const isGitRepo = facts !== null;
  const currentWorktreePath = facts?.worktreeRoot ?? cwd ?? CONFIG_PROCESS_CWD.read();
  const isMain = facts !== null && isMainCheckout(facts);
  // The main checkout is where a resuming agent reaches the base; null when none is
  // designable (e.g. a pool whose origin resolves no repository name), which the
  // refusal checklist renders as "unresolved" rather than echoing the current worktree.
  let designatedMainCheckout: string | null = null;
  if (facts !== null) {
    designatedMainCheckout = mainCheckoutPath(facts);
  }

  // The clean-tree and origin facts feed only the non-main-checkout refusal
  // checklist; the main checkout (permitted regardless of HEAD state) and a non-git
  // base never consult them, so gather them only for a non-main worktree in a git
  // repository. Every non-main worktree — detached or on a branch — still gathers
  // all of them, so the resolver evaluates every prerequisite.
  let isClean = false;
  let defaultBranch: string | null = null;
  let defaultTipSha: string | null = null;
  if (isGitRepo && isMain === false) {
    [isClean, defaultBranch] = await Promise.all([
      isWorkingTreeClean(cwd, deps),
      resolveDefaultBranch(cwd, deps),
    ]);
    defaultTipSha = defaultBranch === null
      ? null
      : await resolveRefSha(`${ORIGIN_REF_PREFIX}${defaultBranch}`, cwd, deps);
  }

  return resolveHandoffGitRef({
    isGitRepo,
    isMainCheckout: isMain,
    branch,
    headSha,
    isClean,
    defaultBranch,
    defaultTipSha,
    currentWorktreePath,
    mainCheckoutPath: designatedMainCheckout,
  });
}

/**
 * Resolves the `git_ref` to record. When the caller supplies an explicit
 * work-branch ref, probes `origin/<ref>` and records the ref once the branch is
 * confirmed on `origin` (throwing {@link SessionWorkBranchNotOnOriginError}
 * otherwise); when no ref is supplied, records the gate-derived base unchanged.
 *
 * An absent or empty ref is "no ref supplied" — the gate-derived base is
 * recorded and no origin probe runs, so the common handoff issues no extra git
 * call. The handoff-base gate has already validated the running worktree before
 * this point, so an explicit ref changes only what is recorded, never whether
 * the handoff is permitted.
 */
async function resolveRecordedGitRef(
  suppliedRef: string | undefined,
  gateRef: string,
  cwd: string | undefined,
  deps: GitDependencies | undefined,
): Promise<string> {
  if (suppliedRef === undefined || suppliedRef.length === 0) return gateRef;
  const existsOnOrigin = await originBranchExists(suppliedRef, cwd, deps);
  return resolveWorkBranchGitRef(suppliedRef, existsOnOrigin);
}

/**
 * Rejects a `specs`/`files` entry that resolves to an existing directory.
 *
 * Each non-empty entry is resolved against the handoff working directory and
 * probed. An entry that resolves to an existing directory throws
 * {@link SessionInjectionDirectoryError} naming the listed entry, because the
 * arrays hold file paths and a directory carries no injectable content. An entry
 * that does not exist, or that cannot be probed, is accepted — only a confirmed
 * directory is rejected, so a path that resolves later still records. An empty
 * entry names no injection target (it resolves to the working directory itself),
 * so it is left to record verbatim rather than probed as a directory.
 */
async function rejectDirectoryInjectionEntries(entries: readonly string[], cwd: string): Promise<void> {
  for (const entry of entries) {
    if (entry.length === 0) continue;
    let entryIsDirectory = false;
    try {
      entryIsDirectory = (await stat(resolve(cwd, entry))).isDirectory();
    } catch {
      continue;
    }
    if (entryIsDirectory) {
      throw new SessionInjectionDirectoryError(entry);
    }
  }
}

/**
 * Executes the handoff command.
 *
 * Creates a new session in the claimable queue for pickup by another context.
 * Output includes `<HANDOFF_ID>` and `<SESSION_FILE>` tags for parsing by
 * automation tools.
 *
 * Caller-supplied structured fields come from a JSON object at the start of
 * stdin; bytes after the JSON object form the markdown body verbatim. The
 * CLI prefills `created_at` from the system clock and `agent_session_id` from
 * `$CLAUDE_SESSION_ID` (falling back to `$CODEX_THREAD_ID`). `git_ref` is the
 * gate-derived base (branch name in the main checkout on a branch, HEAD SHA
 * when detached, or the `origin/<default>` tip SHA in a clean detached non-main
 * checkout), overridden by an explicit work-branch ref the caller supplies in
 * the header once the command confirms that branch exists on `origin`. The
 * handoff-base gate is enforced first regardless, so an explicit ref changes
 * only what is recorded, never whether the handoff is permitted.
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
 * @throws {SessionWorkBranchNotOnOriginError} When the caller-supplied
 *   work-branch ref does not exist on `origin`
 * @throws {SessionInjectionDirectoryError} When a `specs`/`files` entry resolves
 *   to an existing directory
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

  // The git-context gate governs whether handoff is permitted at all, so it
  // resolves before the injection-content check — a disallowed base rejects with
  // its prerequisite checklist rather than a secondary directory-entry error.
  const gateRef = await resolveSessionGitRef(options.cwd, options.deps);
  const gitRef = await resolveRecordedGitRef(header.git_ref, gateRef, options.cwd, options.deps);

  const injectionCwd = options.cwd ?? CONFIG_PROCESS_CWD.read();
  await rejectDirectoryInjectionEntries([...header.specs, ...header.files], injectionCwd);

  const sessionId = generateSessionId();
  const agentSessionId = resolveAgentSessionId(options.env ?? process.env);
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
  await writeFile(sessionPath, fullContent, SESSION_FILE_ENCODING);

  const output = `Created handoff session ${formatSessionOutputMarker(SESSION_OUTPUT_MARKER.HANDOFF_ID, sessionId)}\n${
    formatSessionOutputMarker(SESSION_OUTPUT_MARKER.SESSION_FILE, absolutePath)
  }`;
  return { output };
}
