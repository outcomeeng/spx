/**
 * Dynamic help text for spx spec apply, built from constants and adapter registry.
 */
import { ADAPTERS } from "./adapters/index.js";
import { EXCLUDE_FILENAME, SPX_PREFIX } from "./constants.js";

/**
 * Build the help text for spx spec apply.
 *
 * Generates language support table and tool details from the adapter registry,
 * so the help stays in sync with the implementation.
 */
function buildApplyHelp(): string {
  const excludePath = `${SPX_PREFIX}${EXCLUDE_FILENAME}`;

  const languageLines = ADAPTERS.map((adapter) => {
    const tools = adapter.tools.join(", ");
    const excluded = adapter.excluded.length > 0 ? `\n      NOT configured: ${adapter.excluded.join(", ")}` : "";
    return `    ${adapter.language} (${adapter.configFile})\n      Configures: ${tools}${excluded}`;
  });

  return `
Reads ${excludePath} and applies exclusions to the project's tool configuration.
Each excluded node is translated into the appropriate format for the detected
language's test runner, type checker, and other quality gate tools.

Source:
  ${excludePath}
  One node path per line. Comments (#) and blank lines are ignored.
  Path traversal (..) and absolute paths are rejected.

Supported languages:
${languageLines.join("\n\n")}

Detection:
  The language is auto-detected by checking for config files in order.
  The first match wins.

Examples:
  spx spec apply          # Apply exclusions to detected config file
`;
}

/** Extended help text appended after the command description */
export const APPLY_HELP = buildApplyHelp();
