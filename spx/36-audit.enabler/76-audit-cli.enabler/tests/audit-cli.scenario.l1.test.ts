import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { AUDIT_CLI } from "@/interfaces/cli/audit";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";

describe("audit CLI registry", () => {
  it("registers the audit command group through the root CLI registry", () => {
    const auditDomain = CLI_DOMAINS.find((domain) => domain.name === AUDIT_CLI.commandName);
    expect(auditDomain).toBeDefined();
    if (auditDomain === undefined) throw new Error("audit domain missing");

    const program = new Command();
    auditDomain.register(program);
    const auditCommand = program.commands.find((command) => command.name() === AUDIT_CLI.commandName);

    expect(auditCommand).toBeDefined();
    expect(auditCommand?.commands.map((command) => command.name())).toEqual([
      AUDIT_CLI.initCommandName,
      AUDIT_CLI.progressCommandName,
      AUDIT_CLI.closeCommandName,
      AUDIT_CLI.statusCommandName,
      AUDIT_CLI.listCommandName,
    ]);
  });
});
