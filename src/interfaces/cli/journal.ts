import type { Command } from "commander";

import {
  JOURNAL_CLI_ENV,
  JOURNAL_CLI_EXIT_CODE,
  journalAppendCommand,
  type JournalCliResult,
  journalOpenCommand,
  journalReadCommand,
  journalRenderCommand,
  journalSealCommand,
  type JournalStreamBinding,
} from "@/commands/journal/cli";
import { createGithubPrCommentClient } from "@/commands/journal/github-client";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import type { Result } from "@/config/types";
import type { Domain } from "@/domains/types";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { EPIPE_CODE } from "@/lib/process-lifecycle";

export const JOURNAL_CLI = {
  commandName: "journal",
  description: "Record and stream an agentic verification run journal",
  openCommandName: "open",
  appendCommandName: "append",
  readCommandName: "read",
  sealCommandName: "seal",
  renderCommandName: "render",
  typeOption: "--type <type>",
  runOption: "--run <token>",
  fromOption: "--from <cursor>",
} as const;

const STREAM_LINE_SEPARATOR = "\n";
const MALFORMED_EVENT_INPUT_ERROR = "journal append event input is not valid JSON";

interface JournalScopeCliOptions {
  readonly type: string;
}

interface JournalRunCliOptions extends JournalScopeCliOptions {
  readonly run: string;
}

interface JournalReadCliOptions extends JournalRunCliOptions {
  readonly from: string;
}

function scope(options: JournalScopeCliOptions): { readonly type: string } {
  return { type: options.type };
}

function runScope(options: JournalRunCliOptions): { readonly type: string; readonly runToken: string } {
  return { ...scope(options), runToken: options.run };
}

export const journalDomain: Domain = {
  name: JOURNAL_CLI.commandName,
  description: JOURNAL_CLI.description,
  register: (program: Command) => {
    const journalCmd = program.command(JOURNAL_CLI.commandName).description(JOURNAL_CLI.description);

    journalCmd
      .command(JOURNAL_CLI.openCommandName)
      .description("Open a new run journal and report its run token")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .action(async (options: JournalScopeCliOptions) => {
        await report(await journalOpenCommand(scope(options)));
      });

    journalCmd
      .command(JOURNAL_CLI.appendCommandName)
      .description("Append a JSON event read from standard input and stream it")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .action(async (options: JournalRunCliOptions) => {
        const input = await readStdinEventInput();
        if (!input.ok) {
          await report({ exitCode: JOURNAL_CLI_EXIT_CODE.ERROR, output: input.error });
          return;
        }
        const result = await journalAppendCommand(runScope(options), input.value, streamBinding());
        // A successful append's result is empty — the event already reached the
        // streaming surface — so exit without writing a result line; only report errors.
        if (result.exitCode === JOURNAL_CLI_EXIT_CODE.OK) process.exit(JOURNAL_CLI_EXIT_CODE.OK);
        else await report(result);
      });

    journalCmd
      .command(JOURNAL_CLI.readCommandName)
      .description("Read the run's events at or after a cursor")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .requiredOption(JOURNAL_CLI.fromOption, "Sequence cursor; events at or after it are returned")
      .action(async (options: JournalReadCliOptions) => {
        await report(await journalReadCommand(runScope(options), options.from));
      });

    journalCmd
      .command(JOURNAL_CLI.sealCommandName)
      .description("Seal the run journal so further appends are rejected")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .action(async (options: JournalRunCliOptions) => {
        await report(await journalSealCommand(runScope(options)));
      });

    journalCmd
      .command(JOURNAL_CLI.renderCommandName)
      .description("Render the run's event-prefix projection")
      .requiredOption(JOURNAL_CLI.typeOption, "Opaque verification-type scope segment")
      .requiredOption(JOURNAL_CLI.runOption, "Run token reported by open")
      .action(async (options: JournalRunCliOptions) => {
        await report(await journalRenderCommand(runScope(options)));
      });
  },
};

function stdoutStreamSink(): JournalStreamSink {
  return {
    async emit(event: JournalEvent): Promise<void> {
      await writeOutput(process.stdout, `${JSON.stringify(event)}${STREAM_LINE_SEPARATOR}`);
    },
  };
}

/** The boundary surfaces the journal append streams through: stdout locally, the gh client under github-pr. */
function streamBinding(): JournalStreamBinding {
  const repository = process.env[JOURNAL_CLI_ENV.GITHUB_REPOSITORY] ?? "";
  return {
    localSink: stdoutStreamSink(),
    githubClient: createGithubPrCommentClient({ repository }),
    githubRepository: repository,
  };
}

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

async function report(result: JournalCliResult): Promise<void> {
  const stream = result.exitCode === JOURNAL_CLI_EXIT_CODE.OK ? process.stdout : process.stderr;
  const completed = await writeOutput(stream, `${result.output}${STREAM_LINE_SEPARATOR}`);
  if (completed) process.exit(result.exitCode);
}

function writeOutput(stream: NodeJS.WriteStream, output: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    stream.write(output, (error?: Error | null) => {
      if (error === undefined || error === null) {
        resolve(true);
        return;
      }
      if ((error as NodeJS.ErrnoException).code === EPIPE_CODE) {
        resolve(false);
        return;
      }
      reject(error);
    });
  });
}
