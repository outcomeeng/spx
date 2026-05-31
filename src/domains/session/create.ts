/**
 * Session creation utilities — YAML frontmatter delimiters and the
 * `stringifySessionFrontMatter` writer used by `spx session handoff` and the
 * session test harness.
 *
 * The JSON-prefix input wire format is parsed by
 * `src/domains/session/parse-handoff-input.ts`; this module is responsible
 * only for emitting the on-disk YAML frontmatter shape.
 *
 * @module session/create
 */

import { stringify as stringifyYaml } from "yaml";

import { SESSION_FRONT_MATTER, type SessionPriority } from "./types";

export const SESSION_FRONT_MATTER_DELIMITER = "---";
export const SESSION_FRONT_MATTER_OPEN = `${SESSION_FRONT_MATTER_DELIMITER}\n`;
export const SESSION_FRONT_MATTER_CLOSE = `\n${SESSION_FRONT_MATTER_DELIMITER}\n`;

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
  }, { defaultStringType: "QUOTE_DOUBLE" }).trimEnd();
}

export function buildSessionFrontMatterContent(
  frontMatterLines: readonly string[],
  body: string,
  closeDelimiter: string = SESSION_FRONT_MATTER_DELIMITER,
): string {
  return `${SESSION_FRONT_MATTER_OPEN}${frontMatterLines.join("\n")}\n${closeDelimiter}\n${body}`;
}
