/**
 * Generators for terminal-text composition inputs.
 *
 * `fc.string()` draws from printable ASCII only, so it cannot exercise escaping
 * at all — every assertion about control bytes would hold against an identity
 * escaper. These generators draw over the byte classes the escaping contract
 * actually distinguishes, and guarantee at least one unsafe byte per value so a
 * regression in the escaping branch fails rather than passes vacuously.
 *
 * @module testing/generators/terminal-text/terminal-text
 */

import fc from "fast-check";

import {
  CONTROL_CHAR_UPPER_BOUND,
  DEL_CHAR_CODE,
  FIRST_PRINTABLE_CHAR_CODE,
  HEX_PAD,
  HEX_RADIX,
} from "@/lib/sanitize-cli-argument";

const ORACLE_HEX_ESCAPE_PREFIX = String.raw`\x`;
const ORACLE_HEX_PAD_CHARACTER = "0";

export interface TerminalEscapingCase {
  readonly input: string;
  readonly escaped: string;
}

/** A byte the terminal treats as a command rather than as text: C0 controls and DEL. */
export const arbitraryTerminalUnsafeCodePoint = (): fc.Arbitrary<number> =>
  fc.oneof(fc.integer({ min: 0, max: CONTROL_CHAR_UPPER_BOUND }), fc.constant(DEL_CHAR_CODE));

/** A byte that renders as itself. */
export const arbitraryPrintableCodePoint = (): fc.Arbitrary<number> =>
  fc.integer({ min: FIRST_PRINTABLE_CHAR_CODE, max: DEL_CHAR_CODE - 1 });

/**
 * Text carrying at least one terminal-unsafe byte among printable characters —
 * the shape an environment-supplied value takes when it embeds a control
 * sequence. The guaranteed unsafe byte is what makes an assertion about
 * escaping non-vacuous.
 */
export const arbitraryTerminalUnsafeText = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.array(arbitraryPrintableCodePoint(), { maxLength: 8 }),
      arbitraryTerminalUnsafeCodePoint(),
      fc.array(fc.oneof(arbitraryPrintableCodePoint(), arbitraryTerminalUnsafeCodePoint()), { maxLength: 8 }),
    )
    .map(([head, unsafe, tail]) => String.fromCodePoint(...head, unsafe, ...tail));

/** Unsafe text paired with an escape rendering computed independently from production. */
export const arbitraryTerminalEscapingCase = (): fc.Arbitrary<TerminalEscapingCase> =>
  arbitraryTerminalUnsafeText().map((input) => ({
    input,
    escaped: independentlyEscapeTerminalText(input),
  }));

function independentlyEscapeTerminalText(input: string): string {
  return Array.from(input, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Terminal escaping oracle received an empty character");
    }
    return codePoint <= CONTROL_CHAR_UPPER_BOUND || codePoint === DEL_CHAR_CODE
      ? `${ORACLE_HEX_ESCAPE_PREFIX}${codePoint.toString(HEX_RADIX).padStart(HEX_PAD, ORACLE_HEX_PAD_CHARACTER)}`
      : character;
  }).join("");
}
