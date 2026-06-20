import { describe, expect, it } from "vitest";

import {
  JOURNAL_BACKEND,
  JOURNAL_BACKEND_ORDER,
  type JournalBackendKind,
  type JournalEnvironment,
  resolveJournalBackend,
} from "@/domains/journal/backend-selection";

describe("resolveJournalBackend", () => {
  it.each<{ readonly env: JournalEnvironment; readonly expected: JournalBackendKind }>([
    {
      env: { continuousIntegration: false, githubPullRequest: false },
      expected: JOURNAL_BACKEND.LOCAL,
    },
    {
      env: { continuousIntegration: true, githubPullRequest: false },
      expected: JOURNAL_BACKEND.LOCAL,
    },
    {
      env: { continuousIntegration: true, githubPullRequest: true },
      expected: JOURNAL_BACKEND.GITHUB_PR,
    },
    {
      env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: true, githubPullRequest: true },
      expected: JOURNAL_BACKEND.LOCAL,
    },
    {
      env: { backendOverride: JOURNAL_BACKEND.GITHUB_PR, continuousIntegration: false, githubPullRequest: false },
      expected: JOURNAL_BACKEND.GITHUB_PR,
    },
  ])("maps the environment to the bound backend", ({ env, expected }) => {
    const result = resolveJournalBackend(env);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(expected);
  });

  it("rejects an override that names no registered backend", () => {
    const override = `${JOURNAL_BACKEND.LOCAL}-unregistered`;
    const result = resolveJournalBackend({
      backendOverride: override,
      continuousIntegration: false,
      githubPullRequest: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(override);
      for (const kind of JOURNAL_BACKEND_ORDER) {
        expect(result.error).toContain(kind);
      }
    }
  });
});
