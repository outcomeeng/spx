/**
 * Session creation utilities.
 *
 * @module session/create
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { SESSION_FRONT_MATTER, type SessionPriority } from "./types";

export const MIN_CONTENT_LENGTH = 1;
export const SESSION_CONTENT_ERROR = {
  EMPTY: "Session content cannot be empty",
} as const;
export const SESSION_FRONT_MATTER_DELIMITER = "---";
export const SESSION_FRONT_MATTER_DOCUMENT_END = "...";
export const SESSION_FRONT_MATTER_OPEN = `${SESSION_FRONT_MATTER_DELIMITER}\n`;
export const SESSION_FRONT_MATTER_CLOSE = `\n${SESSION_FRONT_MATTER_DELIMITER}\n`;

const FRONT_MATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/;

export interface PreFillParams {
  createdAt: Date;
  agentSessionId?: string;
  branch: string;
  worktree: string;
}

/**
 * Result of session content validation.
 */
export interface ValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Adds CLI-owned session metadata to an existing frontmatter block.
 *
 * Existing YAML is parsed and re-emitted through the YAML library, so comments,
 * delimiter style, quoting, and key order are normalized while metadata values
 * round-trip through structured YAML.
 */
export function preFillSessionContent(content: string, params: PreFillParams): string {
  const match = FRONT_MATTER_BLOCK.exec(content);
  if (!match) return content;

  const parsed = parseYaml(match[1]) as Record<string, unknown> | null;
  const frontMatter = parsed && typeof parsed === "object" ? parsed : {};
  frontMatter[SESSION_FRONT_MATTER.CREATED_AT] = params.createdAt.toISOString();
  frontMatter[SESSION_FRONT_MATTER.BRANCH] = params.branch;
  frontMatter[SESSION_FRONT_MATTER.WORKTREE] = params.worktree;
  if (params.agentSessionId !== undefined) {
    frontMatter[SESSION_FRONT_MATTER.AGENT_SESSION_ID] = params.agentSessionId;
  } else {
    delete frontMatter[SESSION_FRONT_MATTER.AGENT_SESSION_ID];
  }

  return `${SESSION_FRONT_MATTER_OPEN}${stringifyYaml(frontMatter).trimEnd()}\n${SESSION_FRONT_MATTER_DELIMITER}\n${
    content.slice(match[0].length)
  }`;
}

export interface SessionFrontMatterInput {
  readonly priority: SessionPriority;
  readonly branch?: string;
  readonly worktree?: string;
  readonly goal: string;
  readonly next_step: string;
  readonly result?: string;
  readonly specs?: readonly string[];
  readonly files?: readonly string[];
}

export function stringifySessionFrontMatter(input: SessionFrontMatterInput): string {
  return stringifyYaml({
    [SESSION_FRONT_MATTER.PRIORITY]: input.priority,
    ...(input.branch === undefined ? {} : { [SESSION_FRONT_MATTER.BRANCH]: input.branch }),
    ...(input.worktree === undefined ? {} : { [SESSION_FRONT_MATTER.WORKTREE]: input.worktree }),
    [SESSION_FRONT_MATTER.GOAL]: input.goal,
    [SESSION_FRONT_MATTER.NEXT_STEP]: input.next_step,
    ...(input.result === undefined ? {} : { [SESSION_FRONT_MATTER.RESULT]: input.result }),
    [SESSION_FRONT_MATTER.SPECS]: input.specs ?? [],
    [SESSION_FRONT_MATTER.FILES]: input.files ?? [],
  }).trimEnd();
}

export function buildSessionFrontMatterContent(
  frontMatterLines: readonly string[],
  body: string,
  closeDelimiter: string = SESSION_FRONT_MATTER_DELIMITER,
): string {
  return `${SESSION_FRONT_MATTER_OPEN}${frontMatterLines.join("\n")}\n${closeDelimiter}\n${body}`;
}

export function validateSessionContent(content: string): ValidationResult {
  if (!content || content.trim().length < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      error: SESSION_CONTENT_ERROR.EMPTY,
    };
  }

  return { valid: true };
}
