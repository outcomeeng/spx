import { describe, expect, it } from "vitest";

import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import { VERIFICATION_CONTEXT_CLI } from "@/interfaces/cli/verification-context";

describe("verification-context CLI registry", () => {
  it("registers the verification-context command group with its create verb through the root CLI registry", () => {
    const domain = CLI_DOMAINS.find((candidate) => candidate.name === VERIFICATION_CONTEXT_CLI.commandName);
    expect(domain).toBeDefined();
    if (domain === undefined) throw new Error("verification-context domain missing from the CLI registry");

    const program = createCliProgram({ domains: [domain] });
    const command = program.commands.find((candidate) => candidate.name() === VERIFICATION_CONTEXT_CLI.commandName);

    expect(command).toBeDefined();
    expect(command?.commands.map((candidate) => candidate.name())).toEqual([
      VERIFICATION_CONTEXT_CLI.createCommandName,
    ]);
  });
});
