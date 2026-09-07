import { CONFIG_CLI } from "@/interfaces/cli/config";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
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
  /**
   * Argv whose command name is unknown and carries the escape byte and forged line. Commander
   * answers an unknown command by reading the name back out of the parsed operands rather than
   * receiving it as an argument, so the scenario reaches that diagnostic on its own path.
   */
  readonly unsafeCommandArgv: readonly string[];
  /** The subcommand the argv above addresses, so a caller can assert whose usage was rendered. */
  readonly subcommandName: string;
  /** The escape byte in raw form, which must never survive to the diagnostic. */
  readonly rawEscapeByte: string;
  /** The forged line preceded by a raw line feed, which must never appear intact. */
  readonly rawForgedLineBreak: string;
  /** The escaped escape byte, present when the option text is routed through escaping. */
  readonly escapedEscapeByte: string;
  /**
   * An unknown long option one character short of a registered flag. Commander answers a
   * near match with a two-line message — the diagnostic, then its own newline, then the
   * suggestion — which is the multi-line structure escaping must leave intact.
   */
  readonly nearMatchOption: string;
  /** The registered long flag Commander suggests for `nearMatchOption`. */
  readonly nearMatchOptionSuggestion: string;
  /**
   * Argv naming a registered option whose declared choices reject the value supplied with it.
   * Commander answers a rejected value with a message it composed around that value, so the
   * scenario reaches the diagnostic where the flags the product declared and the bytes the
   * caller typed sit in one string.
   */
  readonly invalidChoiceArgv: readonly string[];
  /** An unknown command one character short of a registered subcommand, answered the same way. */
  readonly nearMatchCommandArgv: readonly string[];
  /** The registered command name Commander suggests for `nearMatchCommandArgv`. */
  readonly nearMatchCommandSuggestion: string;
  /**
   * The escaped line feed. Escaping applied to a whole composed message renders Commander's
   * own newline as these four characters, so its absence is what distinguishes escaping the
   * user-supplied portion from escaping the diagnostic Commander built around it.
   */
  readonly escapedLineFeed: string;
}

/** Drops the final character so the token stays one edit from its source-owned original. */
function oneEditFrom(registeredName: string): string {
  return registeredName.slice(0, -1);
}

const ANSI_SGR_RED_BODY = "[31m";
/**
 * The pattern `String.prototype.replace` reads as "the matched text" in a string replacement.
 * Carried right after the escape byte, it turns a diagnostic that splices its escaped value in
 * as a replacement string into one that pastes the raw match — escape byte included — back in.
 */
const REPLACEMENT_MATCH_PATTERN = "$&";
const UNKNOWN_OPTION_MARKER = "--";
const USAGE_FORGERY_PREFIX = "Usage: ";
const LINE_FEED = "\n";
const ESCAPED_ESCAPE_BYTE = String.raw`\x1b`;
const ESCAPED_LINE_FEED = String.raw`\x0a`;

export function commanderDiagnosticScenario(): CommanderDiagnosticScenario {
  const rawEscapeByte = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
  const token = sampleLiteralTestValue(arbitraryDomainLiteral()).repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH + 1);
  const forgedLine = `${USAGE_FORGERY_PREFIX}${token}`;
  const unsafeValue =
    `${token}${rawEscapeByte}${REPLACEMENT_MATCH_PATTERN}${ANSI_SGR_RED_BODY}${LINE_FEED}${forgedLine}`;
  const unsafeOption = `${UNKNOWN_OPTION_MARKER}${unsafeValue}`;
  return {
    unsafeOption,
    unsafeSubcommandArgv: [CONFIG_CLI.commandName, unsafeOption],
    unsafeCommandArgv: [unsafeValue],
    subcommandName: CONFIG_CLI.commandName,
    rawEscapeByte,
    rawForgedLineBreak: `${LINE_FEED}${forgedLine}`,
    escapedEscapeByte: ESCAPED_ESCAPE_BYTE,
    invalidChoiceArgv: [DIAGNOSE_CLI.COMMAND, DIAGNOSE_CLI.FORMAT_FLAG, unsafeValue],
    nearMatchOption: oneEditFrom(SPX_GLOBAL_OPTIONS.directory.long),
    nearMatchOptionSuggestion: SPX_GLOBAL_OPTIONS.directory.long,
    nearMatchCommandArgv: [oneEditFrom(CONFIG_CLI.commandName)],
    nearMatchCommandSuggestion: CONFIG_CLI.commandName,
    escapedLineFeed: ESCAPED_LINE_FEED,
  };
}
