/**
 * Session creation utilities.
 *
 * @module session/create
 */

import { SESSION_FRONT_MATTER } from "./types";

export const MIN_CONTENT_LENGTH = 1;
export const SESSION_CONTENT_ERROR = {
  EMPTY: "Session content cannot be empty",
} as const;
export const SESSION_FRONT_MATTER_DELIMITER = "---";
export const SESSION_FRONT_MATTER_DOCUMENT_END = "...";
export const SESSION_FRONT_MATTER_OPEN = `${SESSION_FRONT_MATTER_DELIMITER}\n`;
export const SESSION_FRONT_MATTER_CLOSE = `\n${SESSION_FRONT_MATTER_DELIMITER}\n`;

const FRONT_MATTER_OPEN = /^---\r?\n/;

export interface PreFillParams {
  createdAt: Date;
  agentSessionId?: string;
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

export function preFillSessionContent(content: string, params: PreFillParams): string {
  const match = FRONT_MATTER_OPEN.exec(content);
  if (!match) return content;
  const lines = [`${SESSION_FRONT_MATTER.CREATED_AT}: "${params.createdAt.toISOString()}"`];
  if (params.agentSessionId !== undefined) {
    lines.push(`${SESSION_FRONT_MATTER.AGENT_SESSION_ID}: "${params.agentSessionId}"`);
  }
  return match[0] + lines.join("\n") + "\n" + content.slice(match[0].length);
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
