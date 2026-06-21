import { describe, expect, it } from "vitest";

import {
  GITHUB_PULL_REQUEST_EVENT_NAMES,
  JOURNAL_CLI_ENV,
  readJournalCliEnvironment,
  TRUTHY_ENV_VALUES,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";

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

  it.each(TRUTHY_ENV_VALUES)("maps a truthy CI value %s to continuousIntegration true", (value) => {
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.CONTINUOUS_INTEGRATION]: value });

    expect(result.backend.continuousIntegration).toBe(true);
  });

  it("treats a non-truthy CI value as not continuous integration", () => {
    // Only the truthy values count; an arbitrary non-empty value does not.
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.CONTINUOUS_INTEGRATION]: "yes" });

    expect(result.backend.continuousIntegration).toBe(false);
  });

  it("treats an unset CI value as not continuous integration", () => {
    const result = readJournalCliEnvironment({});

    expect(result.backend.continuousIntegration).toBe(false);
  });

  it("maps SPX_VERIFY_BACKEND to the backend override", () => {
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.BACKEND]: JOURNAL_BACKEND.LOCAL });

    expect(result.backend.backendOverride).toBe(JOURNAL_BACKEND.LOCAL);
  });

  it("maps SPX_VERIFY_BRANCH to the branch override", () => {
    const branch = "feature-branch";
    const result = readJournalCliEnvironment({ [JOURNAL_CLI_ENV.BRANCH]: branch });

    expect(result.branch).toBe(branch);
  });
});
