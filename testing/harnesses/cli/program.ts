import { CommanderError } from "commander";
import { expect } from "vitest";

import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram, SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { ESCAPE_CONTROL_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import { commanderDiagnosticScenario } from "@testing/generators/cli/program";

export async function assertCommanderDiagnosticsPreserveStructureAndLength(): Promise<void> {
  const scenario = commanderDiagnosticScenario();
  const stderr: string[] = [];
  const program = createCliProgram({
    domains: [],
    writeStderr: (value) => stderr.push(value),
    exit: (exitCode) => {
      throw new CommanderError(exitCode, SPX_PROGRAM_NAME, "unexpected explicit exit");
    },
  });
  program.exitOverride();
  program.showHelpAfterError();

  await expect(
    program.parseAsync([scenario.unsafeOption], { from: SPX_COMMANDER_PARSE_SOURCE }),
  ).rejects.toBeInstanceOf(CommanderError);

  const diagnostic = stderr.join("");
  expect(diagnostic).toContain(scenario.expectedPrintableToken);
  expect(diagnostic).not.toContain(String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE));
  expect(diagnostic).toContain(`\nUsage: ${SPX_PROGRAM_NAME}`);
  expect(diagnostic).toContain("--help");
  expect(diagnostic.length).toBeGreaterThan(scenario.minimumCompleteLength);
}
