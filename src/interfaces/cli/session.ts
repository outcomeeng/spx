/**
 * Session CLI — Commander registration descriptor for the session subcommands.
 */
import type { Command } from "commander";

import {
  archiveCommand,
  deleteCommand,
  handoffCommand,
  listCommand,
  pickupCommand,
  pruneCommand,
  PruneValidationError,
  releaseCommand,
  SessionAlreadyArchivedError,
  showCommand,
} from "@/commands/session/index";
import { SessionHandoffBaseError } from "@/domains/session/errors";
import { renderHandoffBaseChecklist } from "@/domains/session/handoff-base-checklist";
import { HANDOFF_FRONTMATTER_HELP, PICKUP_SELECTION_HELP, SESSION_FORMAT_HELP } from "@/domains/session/help";
import { SESSION_STATUSES } from "@/domains/session/types";
import type { Domain } from "@/domains/types";

import { writeWarning } from "./write-warning";

/**
 * Reads content from stdin if available (piped input).
 * Returns undefined if stdin is a TTY (interactive terminal).
 */
async function readStdin(): Promise<string | undefined> {
  // Check if stdin is a TTY (interactive) - if so, don't wait for input
  if (process.stdin.isTTY) {
    return undefined;
  }

  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data.length === 0 ? undefined : data);
    });
    // Handle case where stdin closes without data
    process.stdin.on("error", () => {
      resolve(undefined);
    });
  });
}

/**
 * Handles command errors with consistent formatting.
 */
function handleError(error: unknown): never {
  console.error("Error:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
}

/**
 * Register session domain commands
 *
 * @param sessionCmd - Commander.js session domain command
 */
function registerSessionCommands(sessionCmd: Command): void {
  // list command
  sessionCmd
    .command("list")
    .description("List active sessions (doing + todo by default)")
    .option("--status <status>", "Filter by status (todo|doing|archive); defaults to doing + todo")
    .option("--json", "Output as JSON")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (options: { status?: string; json?: boolean; sessionsDir?: string }) => {
      try {
        const output = await listCommand({
          status: options.status,
          format: options.json ? "json" : "text",
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // todo command (convenience alias for list --status todo)
  sessionCmd
    .command("todo")
    .description("List todo sessions")
    .option("--json", "Output as JSON")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (options: { json?: boolean; sessionsDir?: string }) => {
      try {
        const output = await listCommand({
          status: SESSION_STATUSES[0],
          format: options.json ? "json" : "text",
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // show command
  sessionCmd
    .command("show <id...>")
    .description("Show session content")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await showCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // pickup command
  sessionCmd
    .command("pickup [ids...]")
    .description("Claim one or more sessions (move from todo to doing)")
    .option("--auto", "Auto-select highest priority session")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .addHelpText("after", PICKUP_SELECTION_HELP)
    .action(async (ids: string[], options: { auto?: boolean; sessionsDir?: string }) => {
      try {
        if (ids.length === 0 && !options.auto) {
          console.error("Error: Either session ID or --auto flag is required");
          process.exit(1);
        }
        const output = await pickupCommand({
          sessionIds: ids,
          auto: options.auto,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // release command
  sessionCmd
    .command("release [ids...]")
    .description("Release one or more sessions (move from doing to todo)")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await releaseCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // handoff command
  // Caller-supplied fields come from a JSON header at the start of stdin;
  // bytes after the header form the markdown body verbatim.
  sessionCmd
    .command("handoff")
    .description("Create a handoff session (reads JSON header + body from stdin)")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .addHelpText("after", HANDOFF_FRONTMATTER_HELP)
    .action(async (options: { sessionsDir?: string }) => {
      try {
        // Read content from stdin if available
        const content = await readStdin();

        const result = await handoffCommand({
          content,
          sessionsDir: options.sessionsDir,
          env: process.env,
        });
        console.log(result.output);
      } catch (error) {
        if (error instanceof SessionHandoffBaseError) {
          // A non-main-checkout refusal renders the prerequisite checklist; a
          // non-git base refuses silently; any other git refusal writes the
          // message as a plain diagnostic.
          if (error.checklist !== null) {
            console.error(renderHandoffBaseChecklist(error.checklist));
          } else if (!error.silent) {
            console.error("Error:", `${error.name}: ${error.message}`);
          }
          process.exit(1);
        }
        handleError(error);
      }
    });

  // delete command
  sessionCmd
    .command("delete <id...>")
    .description("Delete one or more sessions")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await deleteCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // prune command
  sessionCmd
    .command("prune")
    .description("Remove old todo sessions, keeping the most recent N")
    .option("--keep <count>", "Number of sessions to keep (default: 5)", "5")
    .option("--dry-run", "Show what would be deleted without deleting")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (options: { keep?: string; dryRun?: boolean; sessionsDir?: string }) => {
      try {
        const keep = options.keep ? Number.parseInt(options.keep, 10) : undefined;
        const output = await pruneCommand({
          keep,
          dryRun: options.dryRun,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        if (error instanceof PruneValidationError) {
          console.error("Error:", error.message);
          process.exit(1);
        }
        handleError(error);
      }
    });

  // archive command
  sessionCmd
    .command("archive <id...>")
    .description("Move one or more sessions to the archive directory")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await archiveCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        console.log(output);
      } catch (error) {
        if (error instanceof SessionAlreadyArchivedError) {
          console.error("Error:", error.message);
          process.exit(1);
        }
        handleError(error);
      }
    });
}

/**
 * Session CLI — Commander registration descriptor for the session subcommands.
 */
export const sessionDomain: Domain = {
  name: "session",
  description: "Manage session workflow",
  register: (program: Command) => {
    const sessionCmd = program
      .command("session")
      .description("Manage session workflow")
      .addHelpText("after", SESSION_FORMAT_HELP);

    registerSessionCommands(sessionCmd);
  },
};
