import {
  ESCAPE_CONTROL_CHAR_CODE,
  formatHexEscape,
  MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
} from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

/**
 * A single Commander-diagnostic scenario: user-supplied argv carrying an ANSI
 * escape byte and an injected line feed that forges a second Usage line. The
 * scenario exercises the terminal-diagnostic sanitization boundary — Commander
 * echoes the unknown-option and error text back to stderr, so a raw escape byte
 * or line feed there would rewrite the terminal or forge a diagnostic line.
 *
 * The escaped-form expectations are the spec's declared `\xNN` output, derived
 * from `formatHexEscape` — the same finite mapping the `sanitize.mapping` test
 * proves independently — so this scenario asserts only that the Commander path
 * routes user bytes through escaping, not that the escaper itself is correct.
 */
export interface CommanderDiagnosticScenario {
  /** An unknown long option whose value carries an escape byte and a forged line. */
  readonly unsafeOption: string;
  /** The escape byte in raw form, which must never survive to the diagnostic. */
  readonly rawEscapeByte: string;
  /** The forged line preceded by a raw line feed, which must never appear intact. */
  readonly rawForgedLineBreak: string;
  /** The escaped escape byte, present when the option text is routed through escaping. */
  readonly escapedEscapeByte: string;
  /** A stray error fragment carrying the same escape byte, for the direct `error()` path. */
  readonly unsafeErrorFragment: string;
}

const ANSI_SGR_RED_BODY = "[31m";
const UNKNOWN_OPTION_MARKER = "--";
const USAGE_FORGERY_PREFIX = "Usage: ";
const LINE_FEED = "\n";

export function commanderDiagnosticScenario(): CommanderDiagnosticScenario {
  const rawEscapeByte = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
  const token = sampleLiteralTestValue(arbitraryDomainLiteral()).repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1);
  const forgedLine = `${USAGE_FORGERY_PREFIX}${token}`;
  return {
    unsafeOption: `${UNKNOWN_OPTION_MARKER}${token}${rawEscapeByte}${ANSI_SGR_RED_BODY}${LINE_FEED}${forgedLine}`,
    rawEscapeByte,
    rawForgedLineBreak: `${LINE_FEED}${forgedLine}`,
    escapedEscapeByte: formatHexEscape(ESCAPE_CONTROL_CHAR_CODE),
    unsafeErrorFragment: `${token}${rawEscapeByte}${ANSI_SGR_RED_BODY}`,
  };
}
