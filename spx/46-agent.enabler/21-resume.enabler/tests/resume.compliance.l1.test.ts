import { describe, it } from "vitest";

import {
  assertAgentResumeUsesConfiguredAgentHomes,
  assertAgentResumeUsesPiAgentDirectory,
  assertBoundedMetadataHeadAndActivityTailWindows,
  assertClaudeBranchReadFromLaterHeadRow,
  assertClaudeProjectNameEncodesPathSeparators,
  assertDedupKeepsInScopeSessionWhenNewerDuplicateOutOfScope,
  assertDeduplicatesSharedSessionIdToNewestActivity,
  assertDefaultAgentSessionStoreDirs,
  assertExcludesClaudeSubagentTranscripts,
  assertExcludesFutureModifiedSessions,
  assertExcludesNonInteractiveCodexTranscripts,
  assertExcludesStaleModifiedSessions,
  assertExplicitSinceBoundsTranscriptReadsByMtime,
  assertExplicitSinceFiltersTranscriptActivity,
  assertExplicitSinceWidensTranscriptReadsBeyondDefaultWindow,
  assertIncludesCodexVsCodeTranscripts,
  assertInvocationWorktreeRootResolvedOnce,
  assertNewestSessionsPerAgentWithinScope,
  assertPartialTailSessionSortsAfterTimestamped,
  assertPiRequiresVersionedOpeningSessionRow,
  assertResumeListOrdersByTranscriptActivityAcrossAgents,
  assertResumeSinceRejectsInvalidDurations,
  assertSkipsClaudeSiblingProjectPrefix,
  assertSourcePathTieBreakSelectsPerAgentCap,
  assertTimestamplessSessionSortsAfterTimestamped,
  assertUnknownActivityFillsRemainingCapSlots,
} from "@testing/harnesses/agent/resume";

describe("agent resume per-agent display cap compliance", () => {
  it("orders and renders list candidates by transcript activity across supported agents", async () => {
    await assertResumeListOrdersByTranscriptActivityAcrossAgents();
  });

  it("keeps only the newest sessions per agent within the active scope, newest first", async () => {
    await assertNewestSessionsPerAgentWithinScope();
  });

  it("fills remaining per-agent cap slots with unknown activity after timestamped sessions", async () => {
    await assertUnknownActivityFillsRemainingCapSlots();
  });
});

describe("agent resume scope-reference resolution compliance", () => {
  it("resolves the invocation worktree root once rather than once per candidate", async () => {
    await assertInvocationWorktreeRootResolvedOnce();
  });
});

describe("agent resume bounded-read compliance", () => {
  it("identifies a candidate from bounded metadata head and activity tail windows", async () => {
    await assertBoundedMetadataHeadAndActivityTailWindows();
  });

  it("keeps an otherwise matching session after timestamped sessions when transcript timestamps are absent", async () => {
    await assertTimestamplessSessionSortsAfterTimestamped();
  });

  it("keeps a partial-tail session after timestamped sessions", async () => {
    await assertPartialTailSessionSortsAfterTimestamped();
  });
});

describe("agent resume deduplication compliance", () => {
  it("collapses sessions that share one session id to the source with the newest transcript activity", async () => {
    await assertDeduplicatesSharedSessionIdToNewestActivity();
  });

  it("keeps an in-scope session when a newer transcript of the same id is out of scope", async () => {
    await assertDedupKeepsInScopeSessionWhenNewerDuplicateOutOfScope();
  });
});

describe("agent resume subagent-exclusion compliance", () => {
  it("excludes non-interactive exec and subagent-thread Codex transcripts", async () => {
    await assertExcludesNonInteractiveCodexTranscripts();
  });

  it("excludes Claude Code subagent transcripts from resume candidates", async () => {
    await assertExcludesClaudeSubagentTranscripts();
  });

  it("includes Codex VS Code transcripts as interactive candidates", async () => {
    await assertIncludesCodexVsCodeTranscripts();
  });
});

describe("agent resume recency-window compliance", () => {
  it("filters explicit windows by bounded transcript activity and excludes unknown activity", async () => {
    await assertExplicitSinceFiltersTranscriptActivity();
  });

  it("bounds explicit-window transcript reads by file modification time", async () => {
    await assertExplicitSinceBoundsTranscriptReadsByMtime();
  });

  it("widens transcript reads when the explicit window exceeds the default", async () => {
    await assertExplicitSinceWidensTranscriptReadsBeyondDefaultWindow();
  });

  it("rejects invalid, zero, negative, non-finite, and unsafe explicit durations before discovery", async () => {
    await assertResumeSinceRejectsInvalidDurations();
  });

  it("excludes sessions modified before the recent-activity window", async () => {
    await assertExcludesStaleModifiedSessions();
  });

  it("excludes sessions carrying a future modification time", async () => {
    await assertExcludesFutureModifiedSessions();
  });
});

describe("agent resume Claude project-prefix compliance", () => {
  it("skips sibling worktree project directories that share the invocation prefix without a path boundary", async () => {
    await assertSkipsClaudeSiblingProjectPrefix();
  });
});

describe("agent resume tie-break compliance", () => {
  it("selects the per-agent cap deterministically by source path when modification times tie", async () => {
    await assertSourcePathTieBreakSelectsPerAgentCap();
  });
});

describe("agent resume Claude branch-scan compliance", () => {
  it("reads the initial Claude branch from a later head row when the first row omits it", async () => {
    await assertClaudeBranchReadFromLaterHeadRow();
  });
});

describe("agent resume Claude project encoding compliance", () => {
  it("encodes every POSIX and Windows path separator so the project name carries none", () => {
    assertClaudeProjectNameEncodesPathSeparators();
  });
});

describe("agent resume Pi session-header compliance", () => {
  it("accepts only Pi transcripts with a versioned opening session row", async () => {
    await assertPiRequiresVersionedOpeningSessionRow();
  });
});

describe("agent resume store path compliance", () => {
  it("reads Codex, Claude Code, and Pi candidates from their default agent session stores", () => {
    assertDefaultAgentSessionStoreDirs();
  });

  it("reads Pi candidates from PI_CODING_AGENT_DIR sessions when no direct session directory is configured", async () => {
    await assertAgentResumeUsesPiAgentDirectory();
  });

  it("reads Codex, Claude Code, and Pi candidates from configured agent session stores", async () => {
    await assertAgentResumeUsesConfiguredAgentHomes();
  });
});
