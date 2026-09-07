/**
 * Generators for terminal-text composition inputs.
 *
 * `fc.string()` draws from printable ASCII only, so it cannot exercise escaping
 * at all — every assertion about control bytes would hold against an identity
 * escaper. These generators draw over the byte classes the escaping contract
 * actually distinguishes, and guarantee at least one unsafe byte per value so a
 * regression in the escaping branch fails rather than passes vacuously.
 *
 * The byte classes and the escape rendering are declared here from the ASCII
 * standard (C0 controls occupy 0x00–0x1F, DEL is 0x7F, printable text begins
 * at 0x20) and the `\xNN` two-digit lowercase hex form the CLI spec declares.
 * They are deliberately not imported from the production sanitizer: an oracle
 * that shared production's boundary constants would move in lockstep with a
 * boundary regression and could never detect it.
 *
 * @module testing/generators/terminal-text/terminal-text
 */

import fc from "fast-check";

const ORACLE_C0_CONTROL_UPPER_BOUND = 0x1f;
const ORACLE_DEL_CODE_POINT = 0x7f;
const ORACLE_FIRST_PRINTABLE_CODE_POINT = 0x20;
const ORACLE_HEX_RADIX = 16;
const ORACLE_HEX_DIGITS = 2;
const ORACLE_HEX_ESCAPE_PREFIX = String.raw`\x`;
const ORACLE_HEX_PAD_CHARACTER = "0";

export interface TerminalEscapingCase {
  readonly input: string;
  readonly escaped: string;
}

/** A byte the terminal treats as a command rather than as text: C0 controls and DEL. */
export const arbitraryTerminalUnsafeCodePoint = (): fc.Arbitrary<number> =>
  fc.oneof(fc.integer({ min: 0, max: ORACLE_C0_CONTROL_UPPER_BOUND }), fc.constant(ORACLE_DEL_CODE_POINT));

/** A byte that renders as itself. */
export const arbitraryPrintableCodePoint = (): fc.Arbitrary<number> =>
  fc.integer({ min: ORACLE_FIRST_PRINTABLE_CODE_POINT, max: ORACLE_DEL_CODE_POINT - 1 });

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
    return codePoint <= ORACLE_C0_CONTROL_UPPER_BOUND || codePoint === ORACLE_DEL_CODE_POINT
      ? `${ORACLE_HEX_ESCAPE_PREFIX}${
        codePoint.toString(ORACLE_HEX_RADIX).padStart(ORACLE_HEX_DIGITS, ORACLE_HEX_PAD_CHARACTER)
      }`
      : character;
  }).join("");
}
