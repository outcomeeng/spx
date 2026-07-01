import { JOURNAL_CLI_ENV, type JournalStreamBinding } from "@/commands/journal/cli";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import type { CliIo } from "@/interfaces/cli/product-context";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { createGithubPullRequestCommentClient, runGhApi } from "@/lib/github-snapshot-sink";

const STREAM_LINE_SEPARATOR = "\n";

/** The local streaming sink: write each event as a JSON line to standard output. */
export function stdoutStreamSink(io: CliIo): JournalStreamSink {
  return {
    async emit(event: JournalEvent): Promise<void> {
      io.writeStdout(`${JSON.stringify(event)}${STREAM_LINE_SEPARATOR}`);
    },
  };
}

/**
 * The journal streaming binding read from the environment: standard output locally, the GitHub
 * pull-request comment client under continuous integration. The journal substrate owns backend
 * binding, so every descriptor that streams a run composes this one builder rather than
 * constructing backends itself.
 */
export function createJournalStreamBinding(io: CliIo): JournalStreamBinding {
  const repository = process.env[JOURNAL_CLI_ENV.GITHUB_REPOSITORY] ?? "";
  return {
    localSink: stdoutStreamSink(io),
    githubClient: createGithubPullRequestCommentClient({ repository, run: runGhApi }),
    githubRepository: repository,
  };
}
