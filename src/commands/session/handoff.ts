/**
 * Session handoff CLI command handler.
 *
 * Creates a new session for handoff to another agent context.
 * Metadata (priority, tags) should be included in the content as YAML frontmatter.
 *
 * @module commands/session/handoff
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveSessionConfig } from "@/git/root";
import { buildSessionFrontMatterContent, preFillSessionContent, validateSessionContent } from "@/session/create";
import { SessionInvalidContentError } from "@/session/errors";
import { generateSessionId } from "@/session/timestamp";
import { DEFAULT_PRIORITY, SESSION_FRONT_MATTER } from "@/session/types";

/**
 * Regex to detect YAML frontmatter presence.
 * Matches opening `---` at start of content.
 */
const FRONT_MATTER_START = /^---\r?\n/;

/**
 * Options for the handoff command.
 */
export interface HandoffOptions {
  /** Session content (from stdin). Should include YAML frontmatter with priority/tags. */
  content?: string;
  /** Custom sessions directory */
  sessionsDir?: string;
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
 * Builds session content, adding default frontmatter only if not present.
 *
 * If content already has frontmatter, returns as-is (preserves agent-provided metadata).
 * If content lacks frontmatter, adds default frontmatter with medium priority.
 *
 * @param content - Raw content from stdin
 * @returns Content ready to be written to session file
 */
export function buildSessionContent(content: string | undefined): string {
  // Default content if none provided
  if (!content || content.trim().length === 0) {
    return buildSessionFrontMatterContent(
      [`${SESSION_FRONT_MATTER.PRIORITY}: ${DEFAULT_PRIORITY}`],
      "\n# New Session\n\nDescribe your task here.",
    );
  }

  // If content already has frontmatter, preserve it as-is
  if (hasFrontmatter(content)) {
    return content;
  }

  // Add default frontmatter to content without it
  return buildSessionFrontMatterContent([`${SESSION_FRONT_MATTER.PRIORITY}: ${DEFAULT_PRIORITY}`], `\n${content}`);
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
 * Metadata (priority, tags) should be included in the content as YAML frontmatter:
 * ```
 * ---
 * priority: high
 * tags: [feature, api]
 * ---
 * # Session content...
 * ```
 *
 * @param options - Command options
 * @returns Formatted output for display with parseable session ID
 * @throws {SessionInvalidContentError} When content validation fails
 */
export async function handoffCommand(options: HandoffOptions): Promise<string> {
  const { config, warning } = await resolveSessionConfig({ sessionsDir: options.sessionsDir });

  // Generate session ID
  const sessionId = generateSessionId();

  const baseContent = buildSessionContent(options.content);
  const agentSessionId = process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_THREAD_ID;
  const fullContent = preFillSessionContent(baseContent, {
    createdAt: new Date(),
    agentSessionId,
  });

  const validation = validateSessionContent(fullContent);
  if (!validation.valid) {
    throw new SessionInvalidContentError(validation.error ?? "Unknown validation error");
  }

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
