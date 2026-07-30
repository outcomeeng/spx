import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { SPX_PROGRAM_NAME } from "@/interfaces/cli/program";
import { commanderDiagnosticScenario } from "@testing/generators/cli/program";
import { runCliDiagnostic } from "@testing/harnesses/cli/diagnostics";

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

  it("escapes control bytes in an unknown command's own name", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic(scenario.unsafeCommandArgv, { registerProductionDomains: true });

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.rawEscapeByte);
    expect(run.stderr).not.toContain(scenario.rawForgedLineBreak);
    expect(run.stderr).toContain(scenario.escapedEscapeByte);
  });

  it("escapes control bytes in the value a registered option's declared choices rejected", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic(scenario.invalidChoiceArgv, { registerProductionDomains: true });

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.rawEscapeByte);
    expect(run.stderr).not.toContain(scenario.rawForgedLineBreak);
    expect(run.stderr).toContain(scenario.escapedEscapeByte);
  });

  it("keeps the newline Commander wrote between a near-match option diagnostic and its suggestion", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic([scenario.nearMatchOption]);
    const lines = run.stderr.split("\n");

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.escapedLineFeed);
    // The two assertions catch different mutations. Escaping the message Commander composed
    // leaves the literal escape sequence the assertion above rejects; dropping that newline
    // instead merges the two lines while leaving no sequence behind, and only ordering sees it.
    expect(lines.findIndex((line) => line.includes(scenario.nearMatchOptionSuggestion)))
      .toBeGreaterThan(lines.findIndex((line) => line.includes(scenario.nearMatchOption)));
  });

  it("keeps that newline in a subcommand near-match too, so every command Commander builds preserves it", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic(scenario.nearMatchCommandArgv, { registerProductionDomains: true });
    const lines = run.stderr.split("\n");

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.escapedLineFeed);
    expect(lines.findIndex((line) => line.includes(scenario.nearMatchCommandSuggestion)))
      .toBeGreaterThan(lines.findIndex((line) => line.includes(scenario.nearMatchCommandArgv[0] ?? "")));
  });
});
