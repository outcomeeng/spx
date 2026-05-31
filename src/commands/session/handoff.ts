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
import { parseHandoffInput } from "@/domains/session/parse-handoff-input";
import { generateSessionId } from "@/domains/session/timestamp";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";
import { detectSessionWorkContext, type GitDependencies, resolveSessionConfig } from "@/git/root";

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
 * Executes the handoff command.
 *
 * Creates a new session in the todo directory for pickup by another context.
 * Output includes `<HANDOFF_ID>` and `<SESSION_FILE>` tags for parsing by
 * automation tools.
 *
 * Caller-supplied structured fields come from a JSON object at the start of
 * stdin; bytes after the JSON object form the markdown body verbatim. The
 * CLI prefills `created_at` from the system clock, `branch` from
 * `git rev-parse --abbrev-ref HEAD`, `worktree` from the relative path to
 * the current worktree root, and `agent_session_id` from `$CLAUDE_SESSION_ID`
 * (falling back to `$CODEX_THREAD_ID`).
 *
 * Canonical invocation:
 *
 *   printf '%s\n' '{"priority":"high","goal":"...","next_step":"..."}' '# Body' | spx session handoff
 *
 * @param options - Command options
 * @returns Output text with `<HANDOFF_ID>` and `<SESSION_FILE>` tags
 * @throws {SessionInvalidContentError} When stdin is empty or whitespace-only
 * @throws {SessionLegacyFrontmatterInputError} When stdin opens with `---\n`
 * @throws {SessionInvalidJsonHeaderError} When the JSON header is malformed
 *   or fails caller-field schema validation
 * @throws {SessionInvalidGoalError} When the parsed `goal` is empty
 * @throws {SessionInvalidNextStepError} When the parsed `next_step` is empty
 * @throws {SessionDetachedHeadError} When git HEAD is detached
 */
export async function handoffCommand(options: HandoffOptions): Promise<string> {
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

  const workContext = await detectSessionWorkContext(options.cwd, options.deps);

  if (header.goal.length === 0) {
    throw new SessionInvalidGoalError();
  }
  if (header.next_step.length === 0) {
    throw new SessionInvalidNextStepError();
  }

  const sessionId = generateSessionId();
  const agentSessionId = process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  const createdAt = new Date().toISOString();

  const frontMatterObject: Record<string, unknown> = {
    [SESSION_FRONT_MATTER.PRIORITY]: header.priority,
    [SESSION_FRONT_MATTER.CREATED_AT]: createdAt,
    [SESSION_FRONT_MATTER.BRANCH]: workContext.branch,
    [SESSION_FRONT_MATTER.WORKTREE]: workContext.worktree,
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

  if (warning) {
    process.stderr.write(`${warning}\n`);
  }

  return `Created handoff session <HANDOFF_ID>${sessionId}</HANDOFF_ID>\n<SESSION_FILE>${absolutePath}</SESSION_FILE>`;
}
