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

  it("keeps the newline Commander wrote between a near-match option diagnostic and its suggestion", async () => {
    const scenario = commanderDiagnosticScenario();

    const run = await runCliDiagnostic([scenario.nearMatchOption]);
    const lines = run.stderr.split("\n");

    expect(run.commanderError).toBeInstanceOf(CommanderError);
    expect(run.stderr).not.toContain(scenario.escapedLineFeed);
    // The suggestion has to land on a later line than the diagnostic. Escaping the message
    // Commander already composed collapses both onto one line, which the negative assertion
    // above would catch, but only this one proves the near match produced a second line at all.
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
