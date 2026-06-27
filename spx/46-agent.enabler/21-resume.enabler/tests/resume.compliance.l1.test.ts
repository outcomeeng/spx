import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_RESUME_LIMITS, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  claudeCodeSessionStoreDir,
  codexSessionStoreDir,
  discoverAgentResumeCandidates,
  isPathInsideOrEqual,
} from "@/domains/agent/resume";
import {
  arbitraryAgentResumeExtraCandidateCount,
  arbitraryAgentResumeNowMs,
  arbitraryAgentSessionCwd,
  arbitraryAgentSessionId,
  arbitraryAgentWorktreeRoot,
  sampleAgentResumeValue,
} from "@testing/generators/agent/resume";
import {
  claudeCodeTranscript,
  codexTranscript,
  codexTranscriptPath,
  MemoryAgentSessionFileSystem,
} from "@testing/harnesses/agent/resume";

describe("agent resume recency and display compliance", () => {
  it("sorts newest first, limits candidates to recent sessions, and caps displayed candidates", async () => {
    const fs = new MemoryAgentSessionFileSystem();
    const nowMs = sampleAgentResumeValue(arbitraryAgentResumeNowMs());
    const sessionTimestamp = new Date(nowMs).toISOString();
    const oldSessionOffsetMs = AGENT_RESUME_LIMITS.RECENT_DAYS
        * AGENT_RESUME_LIMITS.HOURS_PER_DAY
        * AGENT_RESUME_LIMITS.MINUTES_PER_HOUR
        * AGENT_RESUME_LIMITS.SECONDS_PER_MINUTE
        * AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND
      + AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND;
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());
    const worktreeRoot = sampleAgentResumeValue(arbitraryAgentWorktreeRoot(), 1);
    const cwd = sampleAgentResumeValue(arbitraryAgentSessionCwd(worktreeRoot), 2);
    const candidateCount = AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES
      + sampleAgentResumeValue(arbitraryAgentResumeExtraCandidateCount());

    for (let index = 0; index < candidateCount; index += 1) {
      const sessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), index);
      fs.writeFile(
        codexTranscriptPath(homeDir, `${sessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`),
        codexTranscript({ sessionId, cwd, timestamp: sessionTimestamp }),
        nowMs - index,
      );
    }
    const oldSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), candidateCount);
    const futureSessionId = sampleAgentResumeValue(arbitraryAgentSessionId(), candidateCount + 1);
    fs.writeFile(
      join(
        homeDir,
        AGENT_SESSION_STORE.CLAUDE_DIR,
        AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
        `${oldSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
      ),
      claudeCodeTranscript({ sessionId: oldSessionId, cwd, timestamp: sessionTimestamp }),
      nowMs - oldSessionOffsetMs,
    );
    fs.writeFile(
      join(
        homeDir,
        AGENT_SESSION_STORE.CLAUDE_DIR,
        AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR,
        `${futureSessionId}${AGENT_SESSION_STORE.JSONL_EXTENSION}`,
      ),
      claudeCodeTranscript({ sessionId: futureSessionId, cwd, timestamp: sessionTimestamp }),
      nowMs + AGENT_RESUME_LIMITS.MILLISECONDS_PER_SECOND,
    );

    const candidates = await discoverAgentResumeCandidates({
      invocationDir: cwd,
      homeDir,
      nowMs,
      fs,
      resolveWorktreeRoot: async (candidateCwd) =>
        isPathInsideOrEqual(worktreeRoot, candidateCwd) ? worktreeRoot : null,
    });

    expect(candidates).toHaveLength(AGENT_RESUME_LIMITS.DISPLAYED_CANDIDATES);
    expect(candidates.map((candidate) => candidate.modifiedAtMs)).toEqual(
      [...candidates].map((candidate) => candidate.modifiedAtMs).sort((left, right) => right - left),
    );
    expect(candidates.map((candidate) => candidate.sessionId)).not.toContain(oldSessionId);
    expect(candidates.map((candidate) => candidate.sessionId)).not.toContain(futureSessionId);
  });
});

describe("agent resume store path compliance", () => {
  it("reads Codex and Claude Code candidates from their default agent session stores", () => {
    const homeDir = sampleAgentResumeValue(arbitraryAgentWorktreeRoot());

    expect(codexSessionStoreDir(homeDir)).toBe(
      join(homeDir, AGENT_SESSION_STORE.CODEX_DIR, AGENT_SESSION_STORE.CODEX_SESSIONS_DIR),
    );
    expect(claudeCodeSessionStoreDir(homeDir)).toBe(
      join(homeDir, AGENT_SESSION_STORE.CLAUDE_DIR, AGENT_SESSION_STORE.CLAUDE_PROJECTS_DIR),
    );
  });
});
