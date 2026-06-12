/**
 * Compact CLI — Commander registration descriptor for the `compact` command
 * group and its `stash` / `resume` subcommands. Sole site of Commander wiring and
 * process I/O for the compact domain per `spx/14-cli-composition.adr.md`.
 */
import type { Command } from "commander";

import { compactResumeCommand, compactStashCommand } from "@/commands/compact";
import type { Domain } from "@/domains/types";

import { writeWarning } from "./write-warning";

export const COMPACT_COMMAND_NAME = "compact";
export const COMPACT_SUBCOMMAND = {
  STASH: "stash",
  RESUME: "resume",
} as const;

/** The long flags the compact subcommands accept — the entire option surface. */
export const COMPACT_OPTION = {
  SESSION_ID: "--session-id",
  TRANSCRIPT: "--transcript",
} as const;

const COMPACT_DESCRIPTION = "Stash and restore the active spec-tree node across context compaction";
const STASH_DESCRIPTION = "Stash the active spec-tree node from a conversation transcript";
const RESUME_DESCRIPTION = "Print the most recent stashed re-anchoring record as JSON";
const SESSION_ID_OPTION = `${COMPACT_OPTION.SESSION_ID} <id>`;
const SESSION_ID_OPTION_DESCRIPTION = "Per-conversation runtime id";
const TRANSCRIPT_OPTION = `${COMPACT_OPTION.TRANSCRIPT} <path>`;
const TRANSCRIPT_OPTION_DESCRIPTION = "Path to the conversation transcript (JSONL)";
const RESUME_EXIT_NO_RECORD = 1;

interface StashOptions {
  readonly sessionId: string;
  readonly transcript: string;
}

interface ResumeOptions {
  readonly sessionId: string;
}

function handleError(error: unknown): never {
  console.error("Error:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
}

function registerCompactCommands(compactCmd: Command): void {
  compactCmd
    .command(COMPACT_SUBCOMMAND.STASH)
    .description(STASH_DESCRIPTION)
    .requiredOption(SESSION_ID_OPTION, SESSION_ID_OPTION_DESCRIPTION)
    .requiredOption(TRANSCRIPT_OPTION, TRANSCRIPT_OPTION_DESCRIPTION)
    .action(async (options: StashOptions) => {
      try {
        const result = await compactStashCommand({ sessionId: options.sessionId, transcriptPath: options.transcript });
        writeWarning(result.warning);
      } catch (error) {
        handleError(error);
      }
    });

  compactCmd
    .command(COMPACT_SUBCOMMAND.RESUME)
    .description(RESUME_DESCRIPTION)
    .requiredOption(SESSION_ID_OPTION, SESSION_ID_OPTION_DESCRIPTION)
    .action(async (options: ResumeOptions) => {
      try {
        const result = await compactResumeCommand({ sessionId: options.sessionId });
        writeWarning(result.warning);
        if (result.output === null) {
          process.exit(RESUME_EXIT_NO_RECORD);
        }
        console.log(result.output);
      } catch (error) {
        handleError(error);
      }
    });
}

export const compactDomain: Domain = {
  name: COMPACT_COMMAND_NAME,
  description: COMPACT_DESCRIPTION,
  register: (program: Command) => {
    const compactCmd = program.command(COMPACT_COMMAND_NAME).description(COMPACT_DESCRIPTION);
    registerCompactCommands(compactCmd);
  },
};
