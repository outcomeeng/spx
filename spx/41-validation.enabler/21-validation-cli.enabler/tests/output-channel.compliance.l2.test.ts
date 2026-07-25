import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT } from "@/commands/validation/messages";
import { capturedToolOutput, type ValidationCommandResult, validationReport } from "@/commands/validation/types";
import { createValidationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { authoredText, externalValue, renderTerminalText } from "@/lib/terminal-text/terminal-text";
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

describe("the channel a validation subcommand's result takes", () => {
  it("keeps the command's own verdict while escaping the tool bytes it quotes", () => {
    assertProperty(arbitraryTerminalUnsafeText(), async (toolOutput) => {
      const written = await runLintWith(stageReport(toolOutput));

      // The product's own line survives byte-for-byte: a writer that escaped the whole payload
      // would have mangled this too, so its presence rules that failure out.
      expect(written).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_SUCCESS);
      expect(written).toContain(renderTerminalText(externalValue(toolOutput)));
      // The generator guarantees a terminal-unsafe byte, so a raw copy reaching the stream means
      // the reading was never escaped — the defect this assertion exists to catch.
      expect(written).not.toContain(toolOutput);
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
