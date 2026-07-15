import type { Command } from "commander";

import {
  JOURNAL_CLI_EXIT_CODE,
  JOURNAL_CLI_READ_SET_EVENT_LIMIT,
  JOURNAL_CLI_RUN_LIMIT,
  journalAppendCommand,
  journalListCommand,
  journalOpenCommand,
  journalReadCommand,
  journalReadSetCommand,
  journalRenderCommand,
  journalSealCommand,
} from "@/commands/journal/cli";
import type { CliCommandResult, Result } from "@/config/types";
import type { Domain } from "@/interfaces/cli/domain";
import type { CliInvocation, CliIo } from "@/interfaces/cli/product-context";

import { createJournalStreamBinding } from "./lib/journal-stream-binding";
import { CLI_STREAM_REPORT } from "./lib/stream-report";

export const JOURNAL_CLI = {
  commandName: "journal",
  description: "Record and stream an agentic verification run journal",
  openCommandName: "open",
  appendCommandName: "append",
  readCommandName: "read",
  sealCommandName: "seal",
  renderCommandName: "render",
  listCommandName: "list",
  readSetCommandName: "read-set",
  typeOption: "--type <type>",
  runOption: "--run <token>",
  fromOption: "--from <cursor>",
  branchSlugOption: "--branch-slug <slug>",
  sealedOption: "--sealed <state>",
  terminalStateOption: "--terminal-state <state>",
  limitOption: "--limit <count>",
  eventLimitOption: "--event-limit <count>",
} as const;

export const JOURNAL_CLI_HELP = {
  LIST_RUN_LIMIT: `Maximum number of runs (default: ${JOURNAL_CLI_RUN_LIMIT.DEFAULT})`,
  READ_SET_EVENT_LIMIT: `Maximum events returned per run (default: ${JOURNAL_CLI_READ_SET_EVENT_LIMIT.DEFAULT})`,
  READ_SET_RUN_LIMIT: `Maximum number of sealed runs (default: ${JOURNAL_CLI_RUN_LIMIT.DEFAULT})`,
} as const;

const MALFORMED_EVENT_INPUT_ERROR = "journal append event input is not valid JSON";

interface JournalScopeCliOptions {
  readonly type: string;
}

interface JournalRunCliOptions extends JournalScopeCliOptions {
  readonly run: string;
  readonly branchSlug?: string;
}

interface JournalReadCliOptions extends JournalRunCliOptions {
  readonly from: string;
}

interface JournalListCliOptions {
  readonly type?: string;
  readonly branchSlug?: string;
  readonly sealed?: string;
  readonly terminalState?: string;
  readonly limit?: string;
}

interface JournalReadSetCliOptions extends JournalScopeCliOptions {
  readonly branchSlug?: string;
  readonly eventLimit?: string;
  readonly limit?: string;
}

function scope(options: JournalScopeCliOptions): { readonly type: string } {
  return { type: options.type };
}

function runScope(
  options: JournalRunCliOptions,
): { readonly type: string; readonly runToken: string; readonly branchSlug?: string } {
  return {
    ...scope(options),
    runToken: options.run,
    ...(options.branchSlug === undefined ? {} : { branchSlug: options.branchSlug }),
  };
}

export const journalDomain: Domain = {
  name: JOURNAL_CLI.commandName,
  description: JOURNAL_CLI.description,
  register: (program: Command, invocation: CliInvocation) => {
    const journalDeps = () => ({
      cwd: invocation.resolveEffectiveInvocationDir(),
      onWarning: (warning: string | undefined) => {
        if (warning !== undefined) invocation.io.writeStderr(`${warning}${CLI_STREAM_REPORT.LINE_SEPARATOR}`);
      },
    });
    const journalCmd = program.command(JOURNAL_CLI.commandName).description(JOURNAL_CLI.description);

    journalCmd
      .command(JOURNAL_CLI.openCommandName)
      .description("Open a new run journal and report its run token")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .action(async (options: JournalScopeCliOptions) => {
        report(await journalOpenCommand(scope(options), journalDeps()), invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.appendCommandName)
      .description("Append a JSON event read from standard input and stream it")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .action(async (options: JournalRunCliOptions) => {
        const input = await readStdinEventInput();
        if (!input.ok) {
          report({ exitCode: JOURNAL_CLI_EXIT_CODE.ERROR, output: input.error }, invocation.io);
          return;
        }
        const result = await journalAppendCommand(
          runScope(options),
          input.value,
          createJournalStreamBinding(invocation.io),
          journalDeps(),
        );
        // A successful append's result is empty — the event already reached the
        // streaming surface — so exit without writing a result line; only report errors.
        if (result.exitCode === JOURNAL_CLI_EXIT_CODE.OK) invocation.io.setExitCode(JOURNAL_CLI_EXIT_CODE.OK);
        else report(result, invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.readCommandName)
      .description("Read the run's events at or after a cursor")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .requiredOption(JOURNAL_CLI.fromOption, "Sequence cursor; events at or after it are returned")
      .option(JOURNAL_CLI.branchSlugOption, "Branch slug reported by journal list")
      .action(async (options: JournalReadCliOptions) => {
        report(await journalReadCommand(runScope(options), options.from, journalDeps()), invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.sealCommandName)
      .description("Seal the run journal so further appends are rejected")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .action(async (options: JournalRunCliOptions) => {
        report(await journalSealCommand(runScope(options), journalDeps()), invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.renderCommandName)
      .description("Render the run's event-prefix projection")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .option(JOURNAL_CLI.branchSlugOption, "Branch slug reported by journal list")
      .action(async (options: JournalRunCliOptions) => {
        report(await journalRenderCommand(runScope(options), journalDeps()), invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.listCommandName)
      .description("List persisted run metadata")
      .option(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .option(JOURNAL_CLI.branchSlugOption, "State-store branch slug")
      .option(JOURNAL_CLI.sealedOption, "Sealed-state filter")
      .option(JOURNAL_CLI.terminalStateOption, "Terminal-state filter")
      .option(JOURNAL_CLI.limitOption, JOURNAL_CLI_HELP.LIST_RUN_LIMIT)
      .action(async (options: JournalListCliOptions) => {
        report(await journalListCommand(options, journalDeps()), invocation.io);
      });

    journalCmd
      .command(JOURNAL_CLI.readSetCommandName)
      .description("Read sealed runs in one branch and type scope")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .option(JOURNAL_CLI.branchSlugOption, "State-store branch slug")
      .option(JOURNAL_CLI.limitOption, JOURNAL_CLI_HELP.READ_SET_RUN_LIMIT)
      .option(JOURNAL_CLI.eventLimitOption, JOURNAL_CLI_HELP.READ_SET_EVENT_LIMIT)
      .action(async (options: JournalReadSetCliOptions) => {
        report(
          await journalReadSetCommand(
            {
              ...scope(options),
              ...(options.branchSlug === undefined ? {} : { branchSlug: options.branchSlug }),
              ...(options.eventLimit === undefined ? {} : { eventLimit: options.eventLimit }),
              ...(options.limit === undefined ? {} : { limit: options.limit }),
            },
            journalDeps(),
          ),
          invocation.io,
        );
      });
  },
};

async function readStdinEventInput(): Promise<Result<unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown };
  } catch {
    return { ok: false, error: MALFORMED_EVENT_INPUT_ERROR };
  }
}

function report(result: CliCommandResult, io: CliIo): void {
  const output = `${result.output}${CLI_STREAM_REPORT.LINE_SEPARATOR}`;
  if (result.exitCode === JOURNAL_CLI_EXIT_CODE.OK) io.writeStdout(output);
  else io.writeStderr(output);
  io.setExitCode(result.exitCode);
}
