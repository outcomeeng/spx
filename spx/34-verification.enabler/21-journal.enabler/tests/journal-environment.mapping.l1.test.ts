import { describe, expect, it } from "vitest";

import { GITHUB_PULL_REQUEST_EVENT_NAMES, JOURNAL_CLI_ENV, readJournalCliEnvironment } from "@/commands/journal/cli";

describe("readJournalCliEnvironment", () => {
  it.each<{ readonly eventName: string; readonly expected: boolean }>([
    { eventName: GITHUB_PULL_REQUEST_EVENT_NAMES.PULL_REQUEST, expected: true },
    { eventName: GITHUB_PULL_REQUEST_EVENT_NAMES.PULL_REQUEST_TARGET, expected: true },
    // A representative non-pull-request event; any event name outside the set maps to false.
    { eventName: "push", expected: false },
  ])("maps GITHUB_EVENT_NAME $eventName to githubPullRequest $expected", ({ eventName, expected }) => {
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.GITHUB_EVENT_NAME]: eventName });

    expect(result.backend.githubPullRequest).toBe(expected);
  });
});
