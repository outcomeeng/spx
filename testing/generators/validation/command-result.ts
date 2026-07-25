/**
 * Validation command results composed from production contracts.
 *
 * A controlled stage stands in for a real validation stage, so it must return the same shape a
 * real one does — including the terminal payload the CLI boundary writes. Its output is text the
 * scenario authored rather than a reading from any tool, so it composes as authored.
 */
import type { ValidationCommandResult } from "@/commands/validation/types";
import { authoredText } from "@/lib/terminal-text/terminal-text";

/** A stage result whose output is scenario-authored text. */
export function authoredValidationResult(
  result: Omit<ValidationCommandResult, "terminalText">,
): ValidationCommandResult {
  return { ...result, terminalText: authoredText(result.output) };
}
