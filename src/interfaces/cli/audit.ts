import type { Command } from "commander";

import { runVerifyCommand } from "@/commands/audit/verify";
import type { Domain } from "@/domains/types";

export const auditDomain: Domain = {
  name: "audit",
  description: "Audit verdict verification",
  register: (program: Command) => {
    const auditCmd = program.command("audit").description("Audit verdict verification");

    auditCmd
      .command("verify <file>")
      .description("Verify an audit verdict XML file")
      .action(async (file: string) => {
        const exitCode = await runVerifyCommand(file, process.cwd(), console.log);
        process.exit(exitCode);
      });
  },
};
