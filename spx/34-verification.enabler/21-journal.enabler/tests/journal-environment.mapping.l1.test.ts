import { describe, expect, it } from "vitest";

import { GITHUB_PULL_REQUEST_EVENT_NAMES, JOURNAL_CLI_ENV, readJournalCliEnvironment } from "@/commands/journal/cli";

describe("readJournalCliEnvironment", () => {
  it.each<{ readonly eventName: string; readonly expected: boolean }>([
    { eventName: GITHUB_PULL_REQUEST_EVENT_NAMES.PULL_REQUEST, expected: true },
    // pull_request_target is deliberately not recognized — its PR number is not in
    // GITHUB_REF; full support is tracked in the journal node's ISSUES.md.
    { eventName: "pull_request_target", expected: false },
    // A representative non-pull-request event; any event name outside the set maps to false.
    { eventName: "push", expected: false },
  ])("maps GITHUB_EVENT_NAME $eventName to githubPullRequest $expected", ({ eventName, expected }) => {
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.GITHUB_EVENT_NAME]: eventName });

    expect(result.backend.githubPullRequest).toBe(expected);
  });
});
