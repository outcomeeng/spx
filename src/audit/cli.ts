import type { Command } from "commander";

import { runVerifyPipeline } from "@/audit/verify";
import type { Domain } from "@/domains/types";

export async function runVerifyCommand(
  filePath: string,
  projectRoot: string,
  writeLine: (line: string) => void,
): Promise<0 | 1> {
  const result = await runVerifyPipeline(filePath, projectRoot);
  if (result.exitCode === 0) {
    writeLine(result.verdict ?? "");
  } else {
    for (const line of result.lines) {
      writeLine(line);
    }
  }
  return result.exitCode;
}

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
