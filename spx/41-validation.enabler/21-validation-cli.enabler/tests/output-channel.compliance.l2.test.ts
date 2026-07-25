import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT } from "@/commands/validation/messages";
import { capturedToolOutput, type ValidationCommandResult, validationReport } from "@/commands/validation/types";
import { createValidationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { DEL_CHAR_CODE, FIRST_PRINTABLE_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import { authoredText } from "@/lib/terminal-text/terminal-text";
import { arbitraryTerminalUnsafeText } from "@testing/generators/terminal-text/terminal-text";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { runValidationInProcess } from "@testing/harnesses/validation/cli";

/**
 * A stage report of the shape every leaf validation command produces: the product's own verdict
 * line followed by the tool's captured output. The two provenances are decided here, where they
 * are still distinguishable, which is the whole reason the write site receives composed text.
 */
function stageReport(toolOutput: string): ValidationCommandResult {
  return {
    exitCode: 0,
    output: `${VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS}\n${toolOutput}`,
    terminalText: validationReport([
      authoredText(VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS),
      capturedToolOutput(toolOutput),
    ]),
  };
}

async function runLintWith(result: ValidationCommandResult): Promise<string> {
  const captured: string[] = [];
  await runValidationInProcess([validationCliDefinition.subcommands.lint.commandName], {
    domain: createValidationDomain({ commandHandlers: { lint: () => Promise.resolve(result) } }),
    writeStdout: (output) => captured.push(output),
  });
  return captured.join("");
}

/** Whether the terminal reads this code point as a command rather than as text. */
function drivesTerminal(code: number): boolean {
  return code < FIRST_PRINTABLE_CHAR_CODE || code === DEL_CHAR_CODE;
}

describe("the channel a validation subcommand's result takes", () => {
  it("keeps the command's own verdict and lets no control byte but its own line break through", () => {
    assertProperty(arbitraryTerminalUnsafeText(), async (toolOutput) => {
      const written = await runLintWith(stageReport(toolOutput));

      // The product's own line survives byte-for-byte: a writer that escaped the whole payload
      // would have mangled this too, so its presence rules that failure out.
      expect(written).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS);

      // An oracle over byte classes rather than over the composer's own output, so this holds
      // whatever escaping the report uses. The generator guarantees a terminal-unsafe byte, so a
      // survivor here means a reading reached the stream able to drive the terminal.
      const lineFeed = String.fromCodePoint(10);
      const surviving = [...written]
        .map((character) => character.codePointAt(0) ?? 0)
        .filter((code) => drivesTerminal(code) && code !== lineFeed.codePointAt(0));
      expect(surviving).toEqual([]);

      // Line structure is what makes a compiler report readable, and this report prints the
      // tool's lines as its own, so escaping must not collapse them into one.
      expect(written.split(lineFeed)).toHaveLength(toolOutput.split(lineFeed).length + 2);
    }, { level: PROPERTY_LEVEL.L1 });
  });

  it("writes nothing further when the stage already streamed its detail", () => {
    assertProperty(arbitraryTerminalUnsafeText(), async (toolOutput) => {
      const written = await runLintWith({ ...stageReport(toolOutput), streamedDetail: true });

      // Those bytes reached the terminal through the pass-through relay as the tool produced
      // them. Repeating them here would both duplicate the output and restate it as a reading
      // spx composed, which is the mixture the two-channel invariant forbids.
      expect(written).toHaveLength(0);
    }, { level: PROPERTY_LEVEL.L1 });
  });
});
