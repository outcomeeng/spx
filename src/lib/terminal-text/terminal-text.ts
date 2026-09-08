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

import { DEL_CHAR_CODE, escapeCliArgument, sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

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
 * An externally-originated token a diagnostic echoes, escaped and bounded for
 * display through the shared sanitizer: control bytes are escaped, an absent or
 * empty value is named by its sentinel, and a value past the display length is
 * truncated with an ellipsis, so one caller-supplied token cannot flood the
 * terminal. `externalValue` is the unbounded form, for a value whose full text
 * is the point of the output.
 */
export function externalToken(value: unknown): TerminalText {
  return brand(sanitizeCliArgument(value));
}

declare const ALREADY_COMPOSED: unique symbol;

/**
 * What the external-value decision resolves to when handed text that is already
 * composed. The brand is erased at runtime, so the primitive cannot detect a
 * composed value by inspection; it rejects one by type instead, resolving to a
 * shape no composition accepts, so escaping composed text a second time fails
 * to compile rather than corrupting the styling an authored segment carries.
 */
export type AlreadyComposedText = { readonly [ALREADY_COMPOSED]: "embed composed text as it stands" };

/**
 * The type the external-value decision resolves to for an argument of static
 * type `T`. The check distributes over a union, so the branded type, its
 * optional shape, and any union that includes it resolve to a type no
 * composition admits, because such a value may already carry its escaping
 * decision; a plain string, another primitive, or a caught error typed
 * `unknown` resolves to composed text and is escaped here.
 */
export type ExternalValueResult<T> = T extends TerminalText ? AlreadyComposedText : TerminalText;

/**
 * A value that originated outside the product's own source: subprocess output,
 * filesystem paths, file content, environment variables, argv, caught-error
 * messages, or API responses. Control bytes are escaped through the shared
 * argument-escaping contract, so an escape byte cannot rewrite the terminal and
 * a line feed cannot forge a diagnostic line. Text already composed is not an
 * external value and is refused at the type level for every static type that
 * carries the branded type, so neither an unnarrowed optional field nor a union
 * with a plain string can slip past the refusal.
 */
export function externalValue<T>(value: T): ExternalValueResult<T> {
  // The conditional result is decided by the argument's static type alone; at
  // runtime every admitted value is escaped, and the brand is the same string.
  return brand(escapeCliArgument(value)) as ExternalValueResult<T>;
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
 * Joins already-composed parts with an already-composed separator. A rendered
 * list is one composition whose rows are external and whose row separator is
 * the product's own line structure, so the separator carries the decision its
 * producer made — authored, keeping its bytes — while each part keeps the
 * escaping decision made where its values were embedded.
 */
export function joinTerminalText(separator: TerminalText, parts: readonly TerminalText[]): TerminalText {
  return brand(parts.join(separator));
}

/** The JSON escape for DEL, the one control byte `JSON.stringify` leaves as it stands. */
const JSON_DEL_ESCAPE = String.raw`\u007f`;
const DEL_CHAR = String.fromCodePoint(DEL_CHAR_CODE);

/**
 * A machine-readable JSON document the product serializes from values of any
 * provenance. JSON's own grammar is the escaping decision here: the serializer
 * writes every byte below U+0020 inside a string in JSON notation, and DEL —
 * the one control byte the grammar leaves as it stands — is written in the same
 * notation, so the document reaches the terminal with no raw control byte while
 * a machine consumer parsing it decodes every value verbatim. Escaping the
 * values as external segments instead would change what that consumer decodes,
 * which is why a serialized document is neither authored nor external text.
 */
export function jsonDocument(value: object, indent?: number): TerminalText {
  return brand(JSON.stringify(value, null, indent).replaceAll(DEL_CHAR, JSON_DEL_ESCAPE));
}

/**
 * Widens composed text to a plain `string` at a boundary that takes one. The
 * brand is erased at runtime, so this is an identity at the value level; it
 * marks the point a composed value leaves the type's protection.
 */
export function renderTerminalText(text: TerminalText): string {
  return text;
}
