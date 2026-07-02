import { JOURNAL_CLI_ENV, type JournalStreamBinding } from "@/commands/journal/cli";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import type { CliIo } from "@/interfaces/cli/product-context";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { createGithubPullRequestCommentClient, runGhApi } from "@/lib/github-snapshot-sink";

import { CLI_STREAM_REPORT } from "./stream-report";

/** The local streaming sink: write each event as a JSON line to standard output. */
export function stdoutStreamSink(io: CliIo): JournalStreamSink {
  return {
    async emit(event: JournalEvent): Promise<void> {
      io.writeStdout(`${JSON.stringify(event)}${CLI_STREAM_REPORT.LINE_SEPARATOR}`);
    },
  };
}

/**
 * A local streaming sink that writes each event as a JSON line to standard error, so a command
 * whose stdout carries a single structured result keeps the event stream off that result channel.
 */
export function stderrStreamSink(io: CliIo): JournalStreamSink {
  return {
    async emit(event: JournalEvent): Promise<void> {
      io.writeStderr(`${JSON.stringify(event)}${CLI_STREAM_REPORT.LINE_SEPARATOR}`);
    },
  };
}

/**
 * The journal streaming binding read from the environment: a local streaming sink by default
 * standard output, and the GitHub pull-request comment client under continuous integration. The
 * journal substrate owns backend binding, so every descriptor that streams a run composes this one
 * builder rather than constructing backends itself. A caller whose stdout carries a structured
 * command result passes a non-stdout local sink to keep the two channels distinct.
 */
export function createJournalStreamBinding(
  io: CliIo,
  localSink: JournalStreamSink = stdoutStreamSink(io),
): JournalStreamBinding {
  const repository = process.env[JOURNAL_CLI_ENV.GITHUB_REPOSITORY] ?? "";
  return {
    localSink,
    githubClient: createGithubPullRequestCommentClient({ repository, run: runGhApi }),
    githubRepository: repository,
  };
}
