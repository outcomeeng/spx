/**
 * Session domain - Manage session workflow
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
} from "../../commands/session/index.js";
import { SESSION_STATUSES } from "../../session/types.js";
import type { Domain } from "../types.js";
import { HANDOFF_FRONTMATTER_HELP, PICKUP_SELECTION_HELP, SESSION_FORMAT_HELP } from "./help.js";

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
      resolve(data.trim() || undefined);
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
  console.error("Error:", error instanceof Error ? error.message : String(error));
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
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // show command
  sessionCmd
    .command("show <id>")
    .description("Show session content")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (id: string, options: { sessionsDir?: string }) => {
      try {
        const output = await showCommand({
          sessionId: id,
          sessionsDir: options.sessionsDir,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // pickup command
  sessionCmd
    .command("pickup [id]")
    .description("Claim a session (move from todo to doing)")
    .option("--auto", "Auto-select highest priority session")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .addHelpText("after", PICKUP_SELECTION_HELP)
    .action(async (id: string | undefined, options: { auto?: boolean; sessionsDir?: string }) => {
      try {
        if (!id && !options.auto) {
          console.error("Error: Either session ID or --auto flag is required");
          process.exit(1);
        }
        const output = await pickupCommand({
          sessionId: id,
          auto: options.auto,
          sessionsDir: options.sessionsDir,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // release command
  sessionCmd
    .command("release [id]")
    .description("Release a session (move from doing to todo)")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (id: string | undefined, options: { sessionsDir?: string }) => {
      try {
        const output = await releaseCommand({
          sessionId: id,
          sessionsDir: options.sessionsDir,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // handoff command
  // Note: --priority and --tags removed. Metadata should be in content frontmatter.
  // This makes the command deterministic for Claude Code permission pre-approval.
  sessionCmd
    .command("handoff")
    .description("Create a handoff session (reads content with frontmatter from stdin)")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .addHelpText("after", HANDOFF_FRONTMATTER_HELP)
    .action(async (options: { sessionsDir?: string }) => {
      try {
        // Read content from stdin if available
        const content = await readStdin();

        const output = await handoffCommand({
          content,
          sessionsDir: options.sessionsDir,
        });
        console.log(output);
      } catch (error) {
        handleError(error);
      }
    });

  // delete command
  sessionCmd
    .command("delete <id>")
    .description("Delete a session")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (id: string, options: { sessionsDir?: string }) => {
      try {
        const output = await deleteCommand({
          sessionId: id,
          sessionsDir: options.sessionsDir,
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
    .command("archive <id>")
    .description("Move a session to the archive directory")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (id: string, options: { sessionsDir?: string }) => {
      try {
        const output = await archiveCommand({
          sessionId: id,
          sessionsDir: options.sessionsDir,
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
 * Session domain - Manage session workflow
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
