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
 * The type is a branded string rather than a wrapper object. A brand rejects a
 * raw `string` at every narrowed boundary exactly as a wrapper would, while a
 * consumer still reads the value as the string it is — so no caller, harness,
 * or assertion unwraps to use it. The brand is erased at runtime, so a composed
 * value is not detectable by inspection: composition routes by type instead,
 * which is why every interpolation is itself a `TerminalText`.
 *
 * A document relayed from outside the product — release notes, tool output,
 * file content — is not this type. Such a channel makes no terminal-safety
 * claim and is written through the pass-through boundary rather than composed.
 *
 * @module lib/terminal-text/terminal-text
 */

import { escapeCliArgument } from "@/lib/sanitize-cli-argument";

declare const TERMINAL_TEXT_BRAND: unique symbol;

/** Text whose externally-originated segments are control-byte escaped. */
export type TerminalText = string & { readonly [TERMINAL_TEXT_BRAND]: true };

function brand(value: string): TerminalText {
  return value as TerminalText;
}

/**
 * Text the product itself composed — literals, labels, and output a product
 * renderer already styled. Intentional control bytes survive, so ANSI styling
 * and line structure render as authored.
 */
export function authoredText(text: string): TerminalText {
  return brand(text);
}

/**
 * A value that originated outside the product's own source: subprocess output,
 * filesystem paths, file content, environment variables, argv, caught-error
 * messages, or API responses. Control bytes are escaped through the shared
 * argument-escaping contract, so an escape byte cannot rewrite the terminal and
 * a line feed cannot forge a diagnostic line.
 */
export function externalValue(value: unknown): TerminalText {
  return brand(escapeCliArgument(value));
}

/**
 * Composes authored literals with already-decided interpolations: every literal
 * segment of the template is authored, and every interpolated value carries the
 * escaping decision made where it was built. A raw external value is wrapped at
 * the interpolation with `externalValue`, which is the point that decision is
 * made.
 */
export function terminal(strings: TemplateStringsArray, ...values: readonly TerminalText[]): TerminalText {
  let composed = "";
  for (const [index, literal] of strings.entries()) {
    composed += literal;
    if (index < values.length) {
      composed += values[index];
    }
  }
  return brand(composed);
}

/**
 * Joins already-composed parts with a product-authored separator. A rendered
 * list is one composition whose rows are external and whose row separator is
 * the product's own line structure, so the separator keeps its bytes while each
 * part keeps the escaping decision made where its values were embedded.
 */
export function joinTerminalText(separator: string, parts: readonly TerminalText[]): TerminalText {
  return brand(parts.join(separator));
}

/**
 * Widens composed text to a plain `string` at a boundary that takes one. The
 * brand is erased at runtime, so this is an identity at the value level; it
 * marks the point a composed value leaves the type's protection.
 */
export function renderTerminalText(text: TerminalText): string {
  return text;
}
