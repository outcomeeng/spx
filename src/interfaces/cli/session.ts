/**
 * Session CLI — Commander registration descriptor for the session subcommands.
 */
import type { Command } from "commander";

import {
  archiveCommand,
  deleteCommand,
  handoffCommand,
  listCommand,
  loadPickCandidates,
  pickupCommand,
  pruneCommand,
  PruneValidationError,
  releaseCommand,
  SessionAlreadyArchivedError,
  showCommand,
} from "@/commands/session/index";
import { SESSION_LIST_FORMAT } from "@/commands/session/list";
import { SessionHandoffBaseError } from "@/domains/session/errors";
import { renderHandoffBaseChecklist } from "@/domains/session/handoff-base-checklist";
import { HANDOFF_FRONTMATTER_HELP, PICKUP_SELECTION_HELP, SESSION_FORMAT_HELP } from "@/domains/session/help";
import {
  COLOR_FLAG,
  type ColorFlag,
  DEFAULT_LIST_WIDTH,
  LIST_TEXT_MIN_WIDTH,
  resolveListColor,
} from "@/domains/session/list";
import { buildPickupCommand, pickupReference } from "@/domains/session/pick-model";
import { SESSION_STATUSES } from "@/domains/session/types";
import type { Domain } from "@/domains/types";
import { foregroundProcessRunner, lifecycleSignalSuspender } from "@/lib/process-lifecycle";
import { launchAgent } from "./session/pick/launch-agent";
import { PICK_NON_TTY_MESSAGE, runPicker } from "./session/pick/run-picker";

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

/** Maps Commander's tri-state `--color`/`--no-color` option to a `ColorFlag`. */
function colorFlagFromOption(colorOption: boolean | undefined): ColorFlag {
  if (colorOption === true) {
    return COLOR_FLAG.ON;
  }
  if (colorOption === false) {
    return COLOR_FLAG.OFF;
  }
  return COLOR_FLAG.AUTO;
}

/**
 * Resolves the list/todo color decision from process state and the `--color`/
 * `--no-color` flag. This is the descriptor's process I/O: it reads
 * `process.stdout.isTTY` and `NO_COLOR`, then delegates the decision to the pure
 * resolver so the formatter receives a plain boolean.
 */
function resolveListColorDecision(colorOption: boolean | undefined): boolean {
  const noColor = (process.env.NO_COLOR ?? "") !== "";
  return resolveListColor({
    isTty: Boolean(process.stdout.isTTY),
    noColor,
    colorFlag: colorFlagFromOption(colorOption),
  });
}

/**
 * Reads the terminal width for list/todo truncation, clamped to the formatter's
 * minimum and falling back to the default when stdout reports no columns.
 */
function resolveListWidth(): number {
  return Math.max(LIST_TEXT_MIN_WIDTH, process.stdout.columns ?? DEFAULT_LIST_WIDTH);
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
    .option("--fields <fields>", "Comma-separated fields to emit as JSON (implies --json)")
    .option("--color", "Force colored text output")
    .option("--no-color", "Disable colored text output")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(
      async (options: { status?: string; json?: boolean; fields?: string; color?: boolean; sessionsDir?: string }) => {
        try {
          const output = await listCommand({
            status: options.status,
            format: options.json ? SESSION_LIST_FORMAT.JSON : SESSION_LIST_FORMAT.TEXT,
            fields: options.fields,
            color: resolveListColorDecision(options.color),
            width: resolveListWidth(),
            sessionsDir: options.sessionsDir,
            onWarning: writeWarning,
          });
          console.log(output);
        } catch (error) {
          handleError(error);
        }
      },
    );

  // pick command — interactive launcher: browse the todo queue, then hand the
  // selected session to claude or codex via `/pickup`. The picker never claims.
  sessionCmd
    .command("pick")
    .description("Interactively pick a session and launch claude or codex to resume it")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (options: { sessionsDir?: string }) => {
      try {
        // The picker needs a real terminal; refuse a non-interactive context
        // rather than render to a non-TTY stream.
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          console.error(PICK_NON_TTY_MESSAGE);
          process.exit(1);
        }
        const sessions = await loadPickCandidates({
          sessionsDir: options.sessionsDir,
          onWarning: writeWarning,
        });
        const choice = await runPicker(sessions);
        if (choice !== null) {
          // Ink has unmounted and restored the terminal; hand it to the agent,
          // then exit with the agent's status. With the default store the agent
          // resolves the id; with a custom store it is given the session's path
          // made absolute against the working directory so the agent can reach it.
          const reference = pickupReference(choice.session, options.sessionsDir, process.cwd());
          const command = buildPickupCommand(choice.runtime, choice.autoContinue, reference);
          const code = await launchAgent(foregroundProcessRunner, lifecycleSignalSuspender, command);
          process.exit(code);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // todo command (convenience alias for list --status todo)
  sessionCmd
    .command("todo")
    .description("List todo sessions")
    .option("--json", "Output as JSON")
    .option("--fields <fields>", "Comma-separated fields to emit as JSON (implies --json)")
    .option("--color", "Force colored text output")
    .option("--no-color", "Disable colored text output")
    .option("--sessions-dir <path>", "Custom sessions directory")
    .action(async (options: { json?: boolean; fields?: string; color?: boolean; sessionsDir?: string }) => {
      try {
        const output = await listCommand({
          status: SESSION_STATUSES[0],
          format: options.json ? SESSION_LIST_FORMAT.JSON : SESSION_LIST_FORMAT.TEXT,
          fields: options.fields,
          color: resolveListColorDecision(options.color),
          width: resolveListWidth(),
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
