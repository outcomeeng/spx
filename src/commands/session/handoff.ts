/**
 * Session handoff CLI command handler.
 *
 * Creates a new session for handoff to another agent context.
 * Session fields should be included in the content as YAML frontmatter.
 *
 * @module commands/session/handoff
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { preFillSessionContent, validateSessionContent } from "@/domains/session/create";
import {
  SessionInvalidContentError,
  SessionInvalidGoalError,
  SessionInvalidNextStepError,
} from "@/domains/session/errors";
import { parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId } from "@/domains/session/timestamp";
import { detectSessionWorkContext, type GitDependencies, resolveSessionConfig } from "@/git/root";

/**
 * Regex to detect YAML frontmatter presence.
 * Matches opening `---` at start of content.
 */
const FRONT_MATTER_START = /^---\r?\n/;

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
 * Checks if content has YAML frontmatter.
 *
 * @param content - Raw session content
 * @returns True if content starts with frontmatter delimiter
 */
export function hasFrontmatter(content: string): boolean {
  return FRONT_MATTER_START.test(content);
}

/**
 * Builds session content from stdin.
 *
 * @param content - Raw content from stdin
 * @returns Non-empty content ready for validation
 * @throws {SessionInvalidContentError} When content is empty
 */
export function buildSessionContent(content: string | undefined): string {
  if (!content || content.trim().length === 0) {
    throw new SessionInvalidContentError("Session content cannot be empty");
  }
  return content;
}

function validateRequiredMetadata(content: string): void {
  const metadata = parseSessionMetadata(content);
  if (metadata.goal.trim().length === 0) {
    throw new SessionInvalidGoalError();
  }
  if (metadata.next_step.trim().length === 0) {
    throw new SessionInvalidNextStepError();
  }
}

/**
 * Executes the handoff command.
 *
 * Creates a new session in the todo directory for pickup by another context.
 * Output includes `<HANDOFF_ID>` tag for easy parsing by automation tools.
 *
 * When no --sessions-dir is provided, sessions are created at the git repository root
 * (if in a git repo) to ensure consistent location across subdirectories.
 *
 * Required metadata should be included in the content as YAML frontmatter:
 * ```
 * ---
 * priority: high
 * goal: Fix login
 * next_step: Run validation
 * ---
 * # Session content...
 * ```
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session ID
 * @throws {SessionInvalidContentError} When content validation fails
 */
export async function handoffCommand(options: HandoffOptions): Promise<string> {
  const { config, warning } = await resolveSessionConfig({
    sessionsDir: options.sessionsDir,
    cwd: options.cwd,
    deps: options.deps,
  });

  const baseContent = buildSessionContent(options.content);
  const workContext = await detectSessionWorkContext(options.cwd, options.deps);

  // Generate session ID
  const sessionId = generateSessionId();

  const agentSessionId = process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  const fullContent = preFillSessionContent(baseContent, {
    createdAt: new Date(),
    agentSessionId,
    branch: workContext.branch,
    worktree: workContext.worktree,
  });

  const validation = validateSessionContent(fullContent);
  if (!validation.valid) {
    throw new SessionInvalidContentError(validation.error ?? "Unknown validation error");
  }
  validateRequiredMetadata(fullContent);

  // Build path to session file
  const filename = `${sessionId}.md`;
  const sessionPath = join(config.todoDir, filename);
  const absolutePath = resolve(sessionPath);

  // Ensure directory exists
  await mkdir(config.todoDir, { recursive: true });

  // Write file
  await writeFile(sessionPath, fullContent, "utf-8");

  // Emit warning to stderr if not in git repo
  if (warning) {
    process.stderr.write(`${warning}\n`);
  }

  return `Created handoff session <HANDOFF_ID>${sessionId}</HANDOFF_ID>\n<SESSION_FILE>${absolutePath}</SESSION_FILE>`;
}
