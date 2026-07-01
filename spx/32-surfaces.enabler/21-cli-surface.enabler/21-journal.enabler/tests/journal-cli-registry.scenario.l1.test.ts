import { describe, expect, it } from "vitest";

import { JOURNAL_CLI } from "@/interfaces/cli/journal";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";

describe("journal CLI registry", () => {
  it("registers the journal command group with its verbs through the root CLI registry", () => {
    const journalDomain = CLI_DOMAINS.find((domain) => domain.name === JOURNAL_CLI.commandName);
    expect(journalDomain).toBeDefined();
    if (journalDomain === undefined) throw new Error("journal domain missing from the CLI registry");

    const program = createCliProgram({ domains: [journalDomain] });
    const journalCommand = program.commands.find((command) => command.name() === JOURNAL_CLI.commandName);

    expect(journalCommand).toBeDefined();
    expect(journalCommand?.commands.map((command) => command.name())).toEqual([
      JOURNAL_CLI.openCommandName,
      JOURNAL_CLI.appendCommandName,
      JOURNAL_CLI.readCommandName,
      JOURNAL_CLI.sealCommandName,
      JOURNAL_CLI.renderCommandName,
      JOURNAL_CLI.listCommandName,
      JOURNAL_CLI.readSetCommandName,
    ]);
  });
});
