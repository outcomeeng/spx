import { CONFIG_CLI } from "@/interfaces/cli/config";
import { ESCAPE_CONTROL_CHAR_CODE, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

/**
 * A single Commander-diagnostic scenario: user-supplied argv carrying an ANSI
 * escape byte and an injected line feed that forges a second Usage line. The
 * scenario exercises the terminal-diagnostic sanitization boundary — Commander
 * echoes the unknown-option and error text back to stderr, so a raw escape byte
 * or line feed there would rewrite the terminal or forge a diagnostic line.
 *
 * `escapedEscapeByte` is written independently rather than derived from the
 * sanitizer's own `formatHexEscape`, so the expectation cannot agree with a
 * defect shared by the formatter under test. The escaped form of an ESC byte is
 * the compliance contract this scenario asserts, which is why the exact text
 * belongs here rather than behind the production helper.
 *
 * The token repeats past the sanitizer's display bound so a diagnostic that
 * truncated instead of escaping — destroying Commander's usage structure —
 * would be caught by the same scenario.
 */
export interface CommanderDiagnosticScenario {
  /** An unknown long option whose value carries an escape byte and a forged line. */
  readonly unsafeOption: string;
  /** The same unknown option addressed to a real subcommand of the production registry. */
  readonly unsafeSubcommandArgv: readonly string[];
  /** The subcommand the argv above addresses, so a caller can assert whose usage was rendered. */
  readonly subcommandName: string;
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
const ESCAPED_ESCAPE_BYTE = String.raw`\x1b`;

export function commanderDiagnosticScenario(): CommanderDiagnosticScenario {
  const rawEscapeByte = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
  const token = sampleLiteralTestValue(arbitraryDomainLiteral()).repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1);
  const forgedLine = `${USAGE_FORGERY_PREFIX}${token}`;
  const unsafeOption = `${UNKNOWN_OPTION_MARKER}${token}${rawEscapeByte}${ANSI_SGR_RED_BODY}${LINE_FEED}${forgedLine}`;
  return {
    unsafeOption,
    unsafeSubcommandArgv: [CONFIG_CLI.commandName, unsafeOption],
    subcommandName: CONFIG_CLI.commandName,
    rawEscapeByte,
    rawForgedLineBreak: `${LINE_FEED}${forgedLine}`,
    escapedEscapeByte: ESCAPED_ESCAPE_BYTE,
    unsafeErrorFragment: `${token}${rawEscapeByte}${ANSI_SGR_RED_BODY}`,
  };
}
