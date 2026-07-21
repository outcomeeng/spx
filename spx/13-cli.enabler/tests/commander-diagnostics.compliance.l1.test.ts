import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { commanderDiagnosticScenario } from "@testing/generators/cli/program";
import { runCliDiagnostic, runCliErrorDiagnostic } from "@testing/harnesses/cli/diagnostics";

describe("Commander diagnostics — terminal byte-safety compliance", () => {
  it("escapes control bytes in a top-level unknown-option diagnostic while preserving Commander's usage structure", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic([scenario.unsafeOption]);

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.rawEscapeByte);
    expect(run.stderr).not.toContain(scenario.rawForgedLineBreak);
    expect(run.stderr).toContain(scenario.escapedEscapeByte);
    expect(run.stderr).toContain(`\nUsage: ${SPX_PROGRAM_NAME}`);
  });

  it("escapes control bytes in a subcommand's own diagnostic, so every command Commander constructs inherits the behavior", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic(scenario.unsafeSubcommandArgv, { registerProductionDomains: true });

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.rawEscapeByte);
    expect(run.stderr).not.toContain(scenario.rawForgedLineBreak);
    expect(run.stderr).toContain(scenario.escapedEscapeByte);
    expect(run.stderr).toContain(`\nUsage: ${SPX_PROGRAM_NAME} ${scenario.subcommandName}`);
  });

  it("escapes control bytes in a direct error diagnostic routed through the managed stderr adapter", () => {
    const scenario = commanderDiagnosticScenario();

    const run = runCliErrorDiagnostic(scenario.unsafeErrorFragment);

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.rawEscapeByte);
    expect(run.stderr).toContain(scenario.escapedEscapeByte);
  });
});
