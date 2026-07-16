import { ESCAPE_CONTROL_CHAR_CODE, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

const ANSI_RED_SEQUENCE_SUFFIX = "[31m";
const UNKNOWN_OPTION_PREFIX = "--";

export interface CommanderDiagnosticScenario {
  readonly unsafeOption: string;
  readonly expectedPrintableToken: string;
  readonly unsafeErrorFragment: string;
  readonly expectedPrintableErrorFragment: string;
  readonly forgedLine: string;
  readonly minimumCompleteLength: number;
}

export function commanderDiagnosticScenario(): CommanderDiagnosticScenario {
  const escapeCharacter = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
  const lineFeed = "\n";
  const token = sampleLiteralTestValue(arbitraryDomainLiteral());
  const forgedLine = `Usage: ${token}`;
  return {
    unsafeOption:
      `${UNKNOWN_OPTION_PREFIX}${token}${escapeCharacter}${ANSI_RED_SEQUENCE_SUFFIX}${lineFeed}${forgedLine}`,
    expectedPrintableToken: `${UNKNOWN_OPTION_PREFIX}${token}${String.raw`\x1b`}${ANSI_RED_SEQUENCE_SUFFIX}${String
      .raw`\x0a`}${forgedLine}`,
    unsafeErrorFragment: `${token}${lineFeed}${forgedLine}`,
    expectedPrintableErrorFragment: `${token}${String.raw`\x0a`}${forgedLine}`,
    forgedLine,
    minimumCompleteLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  };
}
