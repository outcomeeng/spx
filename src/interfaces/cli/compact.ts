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
} as const;

interface CompactStoreCliOptions {
  readonly transcript: string;
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
      .action(async (options: CompactStoreCliOptions) => {
        process.exit(await compactStoreCommand({
          transcript: options.transcript,
          cwd: process.cwd(),
          env: process.env,
        }));
      });

    compactCmd
      .command(COMPACT_CLI.retrieveCommandName)
      .description("Retrieve compact resume state")
      .action(async () => {
        const result = await compactRetrieveCommand({
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
