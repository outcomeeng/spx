import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram, SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { commanderDiagnosticScenario } from "@testing/generators/cli/program";

describe("Commander diagnostics — terminal byte-safety compliance", () => {
  it("escapes control bytes in an unknown-option diagnostic while preserving Commander's usage structure", async () => {
    const scenario = commanderDiagnosticScenario();
    const stderr: string[] = [];
    const program = createCliProgram({ domains: [], writeStderr: (value) => stderr.push(value) });
    program.exitOverride();
    program.showHelpAfterError();

    await expect(
      program.parseAsync([scenario.unsafeOption], { from: SPX_COMMANDER_PARSE_SOURCE }),
    ).rejects.toBeInstanceOf(CommanderError);

    const diagnostic = stderr.join("");
    expect(diagnostic).not.toContain(scenario.rawEscapeByte);
    expect(diagnostic).not.toContain(scenario.rawForgedLineBreak);
    expect(diagnostic).toContain(scenario.escapedEscapeByte);
    expect(diagnostic).toContain(`\nUsage: ${SPX_PROGRAM_NAME}`);
  });

  it("escapes control bytes in a direct error diagnostic routed through the managed stderr adapter", () => {
    const scenario = commanderDiagnosticScenario();
    const stderr: string[] = [];
    const program = createCliProgram({ domains: [], writeStderr: (value) => stderr.push(value) });
    program.exitOverride();

    expect(() => program.error(scenario.unsafeErrorFragment)).toThrow(CommanderError);

    const diagnostic = stderr.join("");
    expect(diagnostic).not.toContain(scenario.rawEscapeByte);
    expect(diagnostic).toContain(scenario.escapedEscapeByte);
  });
});
