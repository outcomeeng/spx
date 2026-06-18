import type { Command } from "commander";

import {
  AUDIT_PROGRESS_STEP,
  auditCloseCommand,
  auditInitCommand,
  auditProgressCommand,
  auditStatusCommand,
  type AuditCommandResult,
} from "@/commands/audit/lifecycle";
import { AUDIT_RUN_STATE_STATUS } from "@/domains/audit/run-state";
import type { Domain } from "@/domains/types";
import { sanitizeCliArgument } from "./sanitize";

export const AUDIT_CLI = {
  commandName: "audit",
  description: "Run and inspect branch-scoped audit lifecycle journals",
  initCommandName: "init",
  progressCommandName: "progress",
  closeCommandName: "close",
  closeAlias: "closure",
  statusCommandName: "status",
  listCommandName: "list",
  branchOption: "--branch <name>",
  headShaOption: "--head-sha <sha>",
  runFileOption: "--run-file <path>",
  stepOption: "--step <step>",
  messageOption: "--message <text>",
  statusOption: "--status <status>",
  verdictPathOption: "--verdict-path <path>",
  jsonOption: "--json",
} as const;

interface AuditInitCliOptions {
  readonly branch?: string;
  readonly headSha?: string;
  readonly json?: boolean;
}

interface AuditProgressCliOptions {
  readonly runFile: string;
  readonly step: string;
  readonly message?: string;
  readonly json?: boolean;
}

interface AuditCloseCliOptions {
  readonly runFile: string;
  readonly status: string;
  readonly verdictPath?: string;
  readonly json?: boolean;
}

interface AuditStatusCliOptions {
  readonly branch?: string;
  readonly json?: boolean;
}

export const auditDomain: Domain = {
  name: AUDIT_CLI.commandName,
  description: AUDIT_CLI.description,
  register: (program: Command) => {
    const auditCmd = program.command(AUDIT_CLI.commandName).description(AUDIT_CLI.description);

    auditCmd
      .command(AUDIT_CLI.initCommandName)
      .description("Initialize an audit run journal")
      .option(AUDIT_CLI.branchOption, "Branch name override")
      .option(AUDIT_CLI.headShaOption, "HEAD SHA override")
      .option(AUDIT_CLI.jsonOption, "Emit JSON")
      .action(async (options: AuditInitCliOptions) => {
        await report(await auditInitCommand({
          branch: options.branch,
          headSha: options.headSha,
          json: options.json,
        }));
      });

    auditCmd
      .command(AUDIT_CLI.progressCommandName)
      .description("Append an audit lifecycle progress update")
      .requiredOption(AUDIT_CLI.runFileOption, "Audit run file created by init")
      .requiredOption(
        AUDIT_CLI.stepOption,
        `Lifecycle step (${Object.values(AUDIT_PROGRESS_STEP).join(", ")})`,
      )
      .option(AUDIT_CLI.messageOption, "Progress detail")
      .option(AUDIT_CLI.jsonOption, "Emit JSON")
      .action(async (options: AuditProgressCliOptions) => {
        await report(await auditProgressCommand(options));
      });

    auditCmd
      .command(AUDIT_CLI.closeCommandName)
      .alias(AUDIT_CLI.closeAlias)
      .description("Seal an audit run journal with a terminal verdict")
      .requiredOption(AUDIT_CLI.runFileOption, "Audit run file created by init")
      .requiredOption(
        AUDIT_CLI.statusOption,
        `Terminal status (${Object.values(AUDIT_RUN_STATE_STATUS).join(", ")})`,
      )
      .option(AUDIT_CLI.verdictPathOption, "Path to rendered verdict evidence")
      .option(AUDIT_CLI.jsonOption, "Emit JSON")
      .action(async (options: AuditCloseCliOptions) => {
        await report(await auditCloseCommand(options));
      });

    auditCmd
      .command(AUDIT_CLI.statusCommandName)
      .description("Show the latest audit state for a branch")
      .option(AUDIT_CLI.branchOption, "Branch name override")
      .option(AUDIT_CLI.jsonOption, "Emit JSON")
      .action(async (options: AuditStatusCliOptions) => {
        await report(await auditStatusCommand(options));
      });

    auditCmd
      .command(AUDIT_CLI.listCommandName)
      .description("List audit run state for a branch")
      .option(AUDIT_CLI.branchOption, "Branch name override")
      .option(AUDIT_CLI.jsonOption, "Emit JSON")
      .action(async (options: AuditStatusCliOptions) => {
        await report(await auditStatusCommand(options));
      });
  },
};

async function report(result: AuditCommandResult): Promise<void> {
  const output = result.format === "text" ? sanitizeCliOutput(result.output) : result.output;
  if (result.exitCode === 0) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
  }
  process.exitCode = result.exitCode;
}

function sanitizeCliOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => line.length === 0 ? line : sanitizeCliArgument(line))
    .join("\n");
}
