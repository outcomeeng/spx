/**
 * Session CLI — Commander registration descriptor for the session subcommands.
 */
import type { Command } from "commander";
import {
  sessionCliDefinition,
  sessionCommandToken,
  type SessionOptionDefinition,
  sessionOptionsForSubcommand,
  sessionOptionToken,
} from "./session/definition";

import {
  archiveCommand,
  deleteCommand,
  handoffCommand,
  listCommand,
  loadPickCandidates,
  pickupCommand,
  pruneCommand,
  PruneValidationError,
  reconcileCommand,
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
import { SESSION_FILE_ENCODING, SESSION_STATUSES } from "@/domains/session/types";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation } from "@/interfaces/cli/product-context";
import { toMessage } from "@/lib/error-message";
import { foregroundProcessRunner, lifecycleSignalSuspender } from "@/lib/process-lifecycle";
import { launchAgent } from "./session/pick/launch-agent";
import { PICK_NON_TTY_MESSAGE, runPicker } from "./session/pick/run-picker";

export const SESSION_CLI = {
  commandName: "session",
  commands: {
    list: "list",
  },
  flags: {
    json: "--json",
  },
} as const;

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
    process.stdin.setEncoding(SESSION_FILE_ENCODING);
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
function writeOutput(invocation: CliInvocation, output: string): void {
  invocation.io.writeStdout(`${output}\n`);
}

function writeError(invocation: CliInvocation, output: string): void {
  invocation.io.writeStderr(`${output}\n`);
}

function writeInvocationWarning(invocation: CliInvocation, warning: string | undefined): void {
  if (warning !== undefined) {
    writeError(invocation, warning);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return toMessage(error);
}

function handleError(invocation: CliInvocation, error: unknown): never {
  writeError(invocation, `Error: ${formatError(error)}`);
  return invocation.io.exit(1);
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
 * Resolves the list-like color decision from process state and the `--color`/
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
 * Reads the terminal width for list-like truncation, clamped to the formatter's
 * minimum and falling back to the default when stdout reports no columns.
 */
function resolveListWidth(): number {
  const columns = Reflect.get(process.stdout, "columns");
  const resolvedColumns = typeof columns === "number" ? columns : DEFAULT_LIST_WIDTH;
  return Math.max(LIST_TEXT_MIN_WIDTH, resolvedColumns);
}

function addSessionOptions(command: Command, options: readonly SessionOptionDefinition[]): Command {
  for (const option of options) {
    if (option.defaultValue === undefined) {
      command.option(sessionOptionToken(option), option.description);
    } else {
      command.option(sessionOptionToken(option), option.description, option.defaultValue);
    }
  }
  return command;
}

/**
 * Register session domain commands
 *
 * @param sessionCmd - Commander.js session domain command
 */
function registerSessionCommands(sessionCmd: Command, invocation: CliInvocation): void {
  const effectiveInvocationDir = (): string => invocation.resolveEffectiveInvocationDir();

  // list command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.list))
      .description(sessionCliDefinition.subcommands.list.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.list),
  )
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
            cwd: effectiveInvocationDir(),
            onWarning: (warning) => writeInvocationWarning(invocation, warning),
          });
          writeOutput(invocation, output);
        } catch (error) {
          handleError(invocation, error);
        }
      },
    );

  // pick command — interactive launcher: browse the claimable queue, then hand the
  // selected session to claude or codex via `/pickup`. The picker never claims.
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.pick))
      .description(sessionCliDefinition.subcommands.pick.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.pick),
  )
    .action(async (options: { sessionsDir?: string }) => {
      try {
        // The picker needs a real terminal; refuse a non-interactive context
        // rather than render to a non-TTY stream.
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          writeError(invocation, PICK_NON_TTY_MESSAGE);
          invocation.io.exit(1);
        }
        const sessions = await loadPickCandidates({
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        const choice = await runPicker(sessions);
        if (choice !== null) {
          // Ink has unmounted and restored the terminal; hand it to the agent,
          // then exit with the agent's status. With the default store the agent
          // resolves the id; with a custom store it is given the session's path
          // made absolute against the working directory so the agent can reach it.
          const reference = pickupReference(choice.session, options.sessionsDir, effectiveInvocationDir());
          const command = buildPickupCommand(choice.runtime, choice.autoContinue, reference);
          const code = await launchAgent(foregroundProcessRunner, lifecycleSignalSuspender, command);
          invocation.io.exit(code);
        }
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // convenience alias for the claimable-status list view
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.todo))
      .description(sessionCliDefinition.subcommands.todo.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.todo),
  )
    .action(async (options: { json?: boolean; fields?: string; color?: boolean; sessionsDir?: string }) => {
      try {
        const output = await listCommand({
          status: SESSION_STATUSES[0],
          format: options.json ? SESSION_LIST_FORMAT.JSON : SESSION_LIST_FORMAT.TEXT,
          fields: options.fields,
          color: resolveListColorDecision(options.color),
          width: resolveListWidth(),
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // show command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.show))
      .description(sessionCliDefinition.subcommands.show.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.show),
  )
    .action(async (ids: string[], options: { json?: boolean; sessionsDir?: string }) => {
      try {
        const output = await showCommand({
          sessionIds: ids,
          format: options.json ? SESSION_LIST_FORMAT.JSON : SESSION_LIST_FORMAT.TEXT,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // pickup command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.pickup))
      .description(sessionCliDefinition.subcommands.pickup.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.pickup),
  )
    .addHelpText("after", PICKUP_SELECTION_HELP)
    .action(async (ids: string[], options: { auto?: boolean; inject?: boolean; sessionsDir?: string }) => {
      try {
        if (ids.length === 0 && !options.auto) {
          writeError(invocation, "Error: Either session ID or --auto flag is required");
          invocation.io.exit(1);
        }
        const output = await pickupCommand({
          sessionIds: ids,
          auto: options.auto,
          noInject: options.inject === false,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // reconcile command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.reconcile))
      .description(sessionCliDefinition.subcommands.reconcile.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.reconcile),
  )
    // Reconciliation reports one session per invocation; a silently dropped
    // second ID would read as reconciled, so excess operands are rejected.
    .allowExcessArguments(false)
    .action(async (id: string, options: { sessionsDir?: string }) => {
      try {
        const output = await reconcileCommand({
          sessionId: id,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // release command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.release))
      .description(sessionCliDefinition.subcommands.release.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.release),
  )
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await releaseCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // handoff command
  // Caller-supplied fields come from a JSON header at the start of stdin;
  // bytes after the header form the markdown body verbatim.
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.handoff))
      .description(sessionCliDefinition.subcommands.handoff.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.handoff),
  )
    .addHelpText("after", HANDOFF_FRONTMATTER_HELP)
    .action(async (options: { sessionsDir?: string }) => {
      try {
        // Read content from stdin if available
        const content = await readStdin();

        const result = await handoffCommand({
          content,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          env: process.env,
        });
        writeOutput(invocation, result.output);
      } catch (error) {
        if (error instanceof SessionHandoffBaseError) {
          // A non-main-checkout refusal renders the prerequisite checklist; a
          // non-git base refuses silently; any other git refusal writes the
          // message as a plain diagnostic.
          if (error.checklist !== null) {
            writeError(invocation, renderHandoffBaseChecklist(error.checklist));
          } else if (!error.silent) {
            writeError(invocation, `Error: ${error.name}: ${error.message}`);
          }
          invocation.io.exit(1);
        }
        handleError(invocation, error);
      }
    });

  // delete command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.delete))
      .description(sessionCliDefinition.subcommands.delete.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.delete),
  )
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await deleteCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        handleError(invocation, error);
      }
    });

  // prune command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.prune))
      .description(sessionCliDefinition.subcommands.prune.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.prune),
  )
    .action(async (options: { keep?: string; dryRun?: boolean; sessionsDir?: string }) => {
      try {
        const keep = options.keep ? Number.parseInt(options.keep, 10) : undefined;
        const output = await pruneCommand({
          keep,
          dryRun: options.dryRun,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        if (error instanceof PruneValidationError) {
          writeError(invocation, `Error: ${error.message}`);
          invocation.io.exit(1);
        }
        handleError(invocation, error);
      }
    });

  // archive command
  addSessionOptions(
    sessionCmd
      .command(sessionCommandToken(sessionCliDefinition.subcommands.archive))
      .description(sessionCliDefinition.subcommands.archive.description),
    sessionOptionsForSubcommand(sessionCliDefinition.subcommands.archive),
  )
    .action(async (ids: string[], options: { sessionsDir?: string }) => {
      try {
        const output = await archiveCommand({
          sessionIds: ids,
          sessionsDir: options.sessionsDir,
          cwd: effectiveInvocationDir(),
          onWarning: (warning) => writeInvocationWarning(invocation, warning),
        });
        writeOutput(invocation, output);
      } catch (error) {
        if (error instanceof SessionAlreadyArchivedError) {
          writeError(invocation, `Error: ${error.message}`);
          invocation.io.exit(1);
        }
        handleError(invocation, error);
      }
    });
}

/**
 * Session CLI — Commander registration descriptor for the session subcommands.
 */
export const sessionDomain: Domain = {
  name: sessionCliDefinition.domain.commandName,
  description: sessionCliDefinition.domain.description,
  register: (program: Command, invocation: CliInvocation) => {
    const sessionCmd = program
      .command(sessionCliDefinition.domain.commandName)
      .description(sessionCliDefinition.domain.description)
      .addHelpText("after", SESSION_FORMAT_HELP);

    registerSessionCommands(sessionCmd, invocation);
  },
};
