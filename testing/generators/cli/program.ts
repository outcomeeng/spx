import { ESCAPE_CONTROL_CHAR_CODE, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";

const ANSI_RED_SEQUENCE_SUFFIX = "[31m";
const UNKNOWN_OPTION_PREFIX = "--";

export interface CommanderDiagnosticScenario {
  readonly unsafeOption: string;
  readonly expectedPrintableToken: string;
  readonly minimumCompleteLength: number;
}

export function commanderDiagnosticScenario(): CommanderDiagnosticScenario {
  const escapeCharacter = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
  const token = sampleLiteralTestValue(arbitraryDomainLiteral());
  return {
    unsafeOption: `${UNKNOWN_OPTION_PREFIX}${token}${escapeCharacter}${ANSI_RED_SEQUENCE_SUFFIX}`,
    expectedPrintableToken: `${UNKNOWN_OPTION_PREFIX}${token}${String.raw`\x1b`}${ANSI_RED_SEQUENCE_SUFFIX}`,
    minimumCompleteLength: MAX_CLI_ARGUMENT_DISPLAY_LENGTH,
  };
}
