import type { Command } from "commander";

import { compactRetrieveCommand, compactStoreCommand } from "@/commands/compact";
import type { Domain } from "@/domains/types";

export const COMPACT_CLI = {
  commandName: "compact",
  storeCommandName: "store",
  retrieveCommandName: "retrieve",
  description: "Store and retrieve compact resume state",
  transcriptFlag: "--transcript",
  transcriptOption: "--transcript <path>",
  sessionIdFlag: "--session-id",
  sessionIdOption: "--session-id <id>",
  sessionIdDescription: "Agent session identity (overrides the agent-session environment)",
} as const;

interface CompactStoreCliOptions {
  readonly transcript: string;
  readonly sessionId?: string;
}

interface CompactRetrieveCliOptions {
  readonly sessionId?: string;
}

export const compactDomain: Domain = {
  name: COMPACT_CLI.commandName,
  description: COMPACT_CLI.description,
  register: (program: Command) => {
    const compactCmd = program.command(COMPACT_CLI.commandName).description(COMPACT_CLI.description);

    compactCmd
      .command(COMPACT_CLI.storeCommandName)
      .description("Store compact resume state")
      .requiredOption(COMPACT_CLI.transcriptOption, "Transcript JSONL path")
      .option(COMPACT_CLI.sessionIdOption, COMPACT_CLI.sessionIdDescription)
      .action(async (options: CompactStoreCliOptions) => {
        process.exit(
          await compactStoreCommand({
            transcript: options.transcript,
            sessionId: options.sessionId,
            cwd: process.cwd(),
            env: process.env,
          }),
        );
      });

    compactCmd
      .command(COMPACT_CLI.retrieveCommandName)
      .description("Retrieve compact resume state")
      .option(COMPACT_CLI.sessionIdOption, COMPACT_CLI.sessionIdDescription)
      .action(async (options: CompactRetrieveCliOptions) => {
        const result = await compactRetrieveCommand({
          sessionId: options.sessionId,
          cwd: process.cwd(),
          env: process.env,
        });
        if (result.output.length > 0) {
          process.stdout.write(result.output);
        }
        process.exitCode = result.exitCode;
      });
  },
};
