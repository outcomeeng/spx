/**
 * Terminal text composition — the boundary primitive that makes control-byte
 * safety a property of the value rather than a habit of each call site.
 *
 * A `TerminalText` carries text already proven safe to hand to a terminal:
 * every segment that originated outside the product's own source has been
 * control-byte escaped, while product-authored segments keep the ANSI styling
 * and line structure the product intended. Escaping at the write boundary
 * cannot express that difference, because a rendered report is one composite
 * string whose labels are authored and whose readings are external; the trust
 * decision therefore belongs where a value is embedded, not where the finished
 * string is written.
 *
 * @module lib/terminal-text/terminal-text
 */

import { escapeCliArgument } from "@/lib/sanitize-cli-argument";

const TERMINAL_TEXT_TAG = Symbol("spx.terminal-text");

/** Text whose externally-originated segments are control-byte escaped. */
export interface TerminalText {
  readonly [TERMINAL_TEXT_TAG]: true;
  readonly value: string;
}

function make(value: string): TerminalText {
  return { [TERMINAL_TEXT_TAG]: true, value };
}

/** Narrows an unknown value to text already composed through this module. */
export function isTerminalText(candidate: unknown): candidate is TerminalText {
  return typeof candidate === "object" && candidate !== null && TERMINAL_TEXT_TAG in candidate;
}

/**
 * Text the product itself composed — literals, labels, and output a product
 * renderer already styled. Intentional control bytes survive, so ANSI styling
 * and line structure render as authored.
 */
export function authoredText(text: string): TerminalText {
  return make(text);
}

/**
 * A value that originated outside the product's own source: subprocess output,
 * filesystem paths, file content, environment variables, argv, caught-error
 * messages, or API responses. Control bytes are escaped through the shared
 * argument-escaping contract, so an escape byte cannot rewrite the terminal and
 * a line feed cannot forge a diagnostic line. Text already composed through
 * this module passes through, so composition never double-escapes.
 */
export function externalValue(value: unknown): TerminalText {
  return isTerminalText(value) ? value : make(escapeCliArgument(value));
}

/**
 * Composes authored literals with escaped interpolations: every literal segment
 * of the template is authored, and every interpolated value is escaped unless it
 * is already `TerminalText`.
 */
export function terminal(strings: TemplateStringsArray, ...values: readonly unknown[]): TerminalText {
  let composed = "";
  for (const [index, literal] of strings.entries()) {
    composed += literal;
    if (index < values.length) {
      composed += externalValue(values[index]).value;
    }
  }
  return make(composed);
}

/** Joins composed parts, preserving the trust each part already established. */
export function joinTerminalText(parts: readonly TerminalText[], separator: TerminalText): TerminalText {
  return make(parts.map((part) => part.value).join(separator.value));
}

/** Unwraps composed text for a process-stream write at the CLI boundary. */
export function renderTerminalText(text: TerminalText): string {
  return text.value;
}
